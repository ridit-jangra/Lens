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

  return `You are an expert software engineer assistant with full context of the user's codebase. You help with questions, explanations, code reviews, debugging, and implementing features.

You have access to two tools you can invoke by including special blocks in your response:

**Run a shell command:**
\`\`\`shell
<command here>
\`\`\`

**Fetch a URL:**
\`\`\`fetch
<url here>
\`\`\`

The user will be shown the command/URL and asked to approve it before it runs. After approval you will receive the output and can continue your response. Only use these tools when genuinely needed.

**To make code changes**, use this block:
\`\`\`changes
{
  "summary": "Brief explanation of what you changed",
  "patches": [
    {
      "path": "relative/path/to/file.ts",
      "content": "complete new file content",
      "isNew": false
    }
  ]
}
\`\`\`

Rules:
- Always provide COMPLETE file content in patches, never partial
- isNew = true only for brand new files
- Only include files that actually need changes
- If no code changes are needed, respond conversationally
- You can mix explanatory text with any of these blocks
- Only include ONE tool call per response — wait for the result before continuing

Here is the codebase:

${fileList}`;
}

// ── Response parser ───────────────────────────────────────────────────────────

export type ParsedResponse =
  | { kind: "text"; content: string }
  | { kind: "changes"; content: string; patches: FilePatch[] }
  | { kind: "shell"; content: string; command: string }
  | { kind: "fetch"; content: string; url: string };

export function parseResponse(text: string): ParsedResponse {
  const changesMatch = text.match(/```changes\n([\s\S]*?)\n```/);
  if (changesMatch) {
    try {
      const parsed = JSON.parse(changesMatch[1]!) as {
        summary: string;
        patches: FilePatch[];
      };
      const before = text.slice(0, text.indexOf("```changes")).trim();
      const display = [before, parsed.summary].filter(Boolean).join("\n\n");
      return { kind: "changes", content: display, patches: parsed.patches };
    } catch {
      /* fall through */
    }
  }

  const shellMatch = text.match(/```shell\n([\s\S]*?)\n```/);
  if (shellMatch) {
    const command = shellMatch[1]!.trim();
    const before = text.slice(0, text.indexOf("```shell")).trim();
    return { kind: "shell", content: before, command };
  }

  const fetchMatch = text.match(/```fetch\n([\s\S]*?)\n```/);
  if (fetchMatch) {
    const url = fetchMatch[1]!.trim();
    const before = text.slice(0, text.indexOf("```fetch")).trim();
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
      return {
        role: "user",
        content: `Tool result (${m.toolName}):\n${m.result}`,
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
