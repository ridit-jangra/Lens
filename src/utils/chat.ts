import type { ImportantFile } from "../types/repo";
import type { Provider } from "../types/config";
import type { FilePatch } from "../components/repo/DiffViewer";
import type { Message } from "../types/chat";

import path from "path";
import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";

// ── Prompt builder ────────────────────────────────────────────────────────────

export function buildSystemPrompt(files: ImportantFile[]): string {
  const fileList = files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``)
    .join("\n\n");

  return `You are an expert software engineer assistant. You have access to the user's codebase (listed below) and two tools: shell and fetch.

## TOOL RULES — READ CAREFULLY

**You MUST use tools in these situations — never guess or hallucinate:**
- User shares a URL or GitHub link → use fetch immediately to read it
- User asks about files, structure, or content of an external repo → use fetch on the GitHub URL
- User asks you to run something, install something, or check a command → use shell
- User asks about runtime behavior, test results, or build output → use shell
- You don't have enough information to answer accurately → use a tool to get it

**NEVER do these things:**
- Do NOT describe what a URL might contain without fetching it
- Do NOT guess at file contents of repos you haven't fetched
- Do NOT say "I'll need to fetch" or "here's the command" — just emit the tool block directly
- Do NOT ask permission before using a tool — the user will be shown an approval prompt automatically

## TOOL SYNTAX

To fetch a URL (webpage, GitHub repo, raw file, API):
\`\`\`fetch
https://example.com
\`\`\`

To run a shell command:
\`\`\`shell
ls -la
\`\`\`

To make code changes:
\`\`\`changes
{
  "summary": "what changed and why",
  "patches": [
    { "path": "src/foo.ts", "content": "complete file content here", "isNew": false }
  ]
}
\`\`\`

## TOOL FLOW

- Emit exactly ONE tool block per response, then stop
- After the user approves and you receive the result, continue your response
- You can chain tools across turns (fetch → shell → changes) as needed
- Always provide COMPLETE file content in patches, never partial snippets

## CODEBASE

${fileList.length > 0 ? fileList : "(no files indexed)"}`;
}

// ── Response parser ───────────────────────────────────────────────────────────

export type ParsedResponse =
  | { kind: "text"; content: string }
  | { kind: "changes"; content: string; patches: FilePatch[] }
  | { kind: "shell"; content: string; command: string }
  | { kind: "fetch"; content: string; url: string };

export function parseResponse(text: string): ParsedResponse {
  // Find the earliest occurrence of any tool block so ordering in the text is respected
  type Candidate = {
    index: number;
    kind: "changes" | "shell" | "fetch";
    match: RegExpExecArray;
  };
  const candidates: Candidate[] = [];

  const patterns: { kind: Candidate["kind"]; re: RegExp }[] = [
    { kind: "changes", re: /```changes\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "shell", re: /```shell\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "fetch", re: /```fetch\r?\n([\s\S]*?)\r?\n```/g },
  ];

  for (const { kind, re } of patterns) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) candidates.push({ index: m.index, kind, match: m });
  }

  if (candidates.length === 0) return { kind: "text", content: text.trim() };

  // Pick whichever block starts earliest in the response
  candidates.sort((a, b) => a.index - b.index);
  const { kind, match } = candidates[0]!;
  const before = text.slice(0, match.index).trim();
  const body = match[1]!.trim();

  if (kind === "changes") {
    try {
      const parsed = JSON.parse(body) as {
        summary: string;
        patches: FilePatch[];
      };
      const display = [before, parsed.summary].filter(Boolean).join("\n\n");
      return { kind: "changes", content: display, patches: parsed.patches };
    } catch {
      // Malformed JSON — fall through to text
    }
  }

  if (kind === "shell") {
    return { kind: "shell", content: before, command: body };
  }

  if (kind === "fetch") {
    // Strip any accidental markdown or angle brackets the model might add
    const url = body.replace(/^<|>$/g, "").trim();
    return { kind: "fetch", content: before, url };
  }

  return { kind: "text", content: text.trim() };
}

// ── API call ──────────────────────────────────────────────────────────────────

function buildApiMessages(
  messages: Message[],
): { role: string; content: string }[] {
  return messages.map((m) => {
    if (m.type === "tool") {
      if (!m.approved) {
        return {
          role: "user",
          content:
            "The tool call was denied by the user. Please respond without using that tool.",
        };
      }
      const label =
        m.toolName === "shell"
          ? `shell command \`${m.content}\``
          : `fetch of ${m.content}`;
      return {
        role: "user",
        content: `Here is the output from the ${label}:\n\n${m.result}\n\nPlease continue your response based on this output.`,
      };
    }
    return { role: m.role, content: m.content };
  });
}

export async function callChat(
  provider: Provider,
  systemPrompt: string,
  messages: Message[],
): Promise<string> {
  const apiMessages = buildApiMessages(messages);
  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  if (provider.type === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers = {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    };
    body = {
      model: provider.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: apiMessages,
    };
  } else {
    const base = provider.baseUrl ?? "https://api.openai.com/v1";
    url = `${base}/chat/completions`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    };
    body = {
      model: provider.model,
      max_tokens: 4096,
      messages: [{ role: "system", content: systemPrompt }, ...apiMessages],
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as Record<string, unknown>;

  if (provider.type === "anthropic") {
    const content = data.content as { type: string; text: string }[];
    return content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  } else {
    const choices = data.choices as { message: { content: string } }[];
    return choices[0]?.message.content ?? "";
  }
}

// ── GitHub URL detection ──────────────────────────────────────────────────────

export function extractGithubUrl(text: string): string | null {
  const match = text.match(/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/);
  return match ? match[0]! : null;
}

export function toCloneUrl(url: string): string {
  const clean = url.replace(/\/+$/, "");
  return clean.endsWith(".git") ? clean : `${clean}.git`;
}

// ── Clipboard read (sync, cross-platform) ────────────────────────────────────

export function readClipboard(): string {
  try {
    const platform = process.platform;
    if (platform === "win32") {
      return execSync("powershell -noprofile -command Get-Clipboard", {
        encoding: "utf-8",
        timeout: 2000,
      })
        .replace(/\r\n/g, "\n")
        .trimEnd();
    }
    if (platform === "darwin") {
      return execSync("pbpaste", {
        encoding: "utf-8",
        timeout: 2000,
      }).trimEnd();
    }
    for (const cmd of [
      "xclip -selection clipboard -o",
      "xsel --clipboard --output",
      "wl-paste",
    ]) {
      try {
        return execSync(cmd, { encoding: "utf-8", timeout: 2000 }).trimEnd();
      } catch {
        continue;
      }
    }
    return "";
  } catch {
    return "";
  }
}

// ── File system ───────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
]);

export function walkDir(dir: string, base = dir): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir, { encoding: "utf-8" });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const rel = path.relative(base, full).replace(/\\/g, "/");
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) results.push(...walkDir(full, base));
    else results.push(rel);
  }
  return results;
}

export function applyPatches(repoPath: string, patches: FilePatch[]): void {
  for (const patch of patches) {
    const fullPath = path.join(repoPath, patch.path);
    const dir = path.dirname(fullPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, patch.content, "utf-8");
  }
}

// ── Tool execution ────────────────────────────────────────────────────────────

export async function runShell(command: string, cwd: string): Promise<string> {
  try {
    const out = execSync(command, { cwd, timeout: 15000, encoding: "utf-8" });
    return out.trim() || "(no output)";
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const combined = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
    return combined || e.message || "Command failed";
  }
}

export async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Lens/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
  return text || "(empty page)";
}
