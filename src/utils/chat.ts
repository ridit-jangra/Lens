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
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";

export function buildSystemPrompt(
  files: ImportantFile[],
  historySummary = "",
): string {
  const fileList = files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``)
    .join("\n\n");

  return `You are an expert software engineer assistant with access to the user's codebase and four tools.

## TOOLS

You have exactly four tools. To use a tool you MUST wrap it in the exact XML tags shown below — no other format will work.

### 1. fetch — load a URL
<fetch>https://example.com</fetch>

### 2. shell — run a terminal command
<shell>node -v</shell>

### 3. read-file — read a file from the repo
<read-file>src/foo.ts</read-file>

### 4. write-file — create or overwrite a file
<write-file>
{"path": "data/output.csv", "content": "col1,col2\nval1,val2"}
</write-file>

### 5. changes — propose code edits (shown as a diff for user approval)
<changes>
{"summary": "what changed and why", "patches": [{"path": "src/foo.ts", "content": "COMPLETE file content", "isNew": false}]}
</changes>

## RULES

1. When you need to use a tool, output ONLY the XML tag — nothing before or after it in that response
2. ONE tool per response — emit the tag, then stop completely
3. After the user approves and you get the result, continue your analysis in the next response
4. NEVER print a URL, command, filename, or JSON blob as plain text when you should be using a tool
5. NEVER say "I'll fetch" / "run this command" / "here's the write-file" — just emit the tag
6. write-file content field must be the COMPLETE file content, never empty or placeholder
7. After a write-file succeeds, do NOT repeat it — trust the result
8. After a write-file succeeds, use read-file to verify the content before telling the user it is done

## FETCH → WRITE FLOW (follow this exactly when saving fetched data)

1. fetch the URL
2. Analyze the result — count the rows, identify columns, check completeness
3. Tell the user what you found: "Found X rows with columns: A, B, C. Writing now."
4. emit write-file with correctly structured, complete content
5. After write-file confirms success, emit read-file to verify
6. Only after read-file confirms content is correct, tell the user it is done

## WHEN TO USE TOOLS

- User shares any URL → fetch it immediately
- User asks to run anything → shell it immediately
- User asks to read a file → read-file it immediately
- User asks to save/create/write a file → write-file it immediately, then read-file to verify
- You need more information → use the appropriate tool

## CODEBASE

${fileList.length > 0 ? fileList : "(no files indexed)"}

${historySummary}`;
}

export const FEW_SHOT_MESSAGES: { role: string; content: string }[] = [
  {
    role: "user",
    content: "fetch https://api.github.com/repos/microsoft/typescript",
  },
  {
    role: "assistant",
    content: "<fetch>https://api.github.com/repos/microsoft/typescript</fetch>",
  },
  {
    role: "user",
    content:
      'Here is the output from fetch of https://api.github.com/repos/microsoft/typescript:\n\n{"name":"TypeScript","stargazers_count":100000}\n\nPlease continue your response based on this output.',
  },

  {
    role: "assistant",
    content:
      "Found 1 object with fields: name, stargazers_count. Writing to ts-info.json now.",
  },
  {
    role: "user",
    content: "ok go ahead",
  },
  {
    role: "assistant",
    content:
      '<write-file>\n{"path": "ts-info.json", "content": "{\"name\":\"TypeScript\",\"stars\":100000}"}\n</write-file>',
  },
  {
    role: "user",
    content:
      "Here is the output from write-file to ts-info.json:\n\nWritten: /repo/ts-info.json (1 lines, 44 bytes)\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "<read-file>ts-info.json</read-file>",
  },
  {
    role: "user",
    content:
      'Here is the output from read-file of ts-info.json:\n\nFile: ts-info.json (1 lines)\n\n{\"name\":\"TypeScript\",\"stars\":100000}\n\nPlease continue your response based on this output.',
  },
  {
    role: "assistant",
    content: "Done — saved and verified `ts-info.json`. Data looks correct.",
  },

  {
    role: "user",
    content: "what node version am I on",
  },
  {
    role: "assistant",
    content: "<shell>node -v</shell>",
  },
  {
    role: "user",
    content:
      "Here is the output from shell command `node -v`:\n\nv20.11.0\n\nPlease continue your response based on this output.",
  },
  {
    role: "assistant",
    content: "You're running Node.js v20.11.0.",
  },
];

export type ParsedResponse =
  | { kind: "text"; content: string }
  | { kind: "changes"; content: string; patches: FilePatch[] }
  | { kind: "shell"; content: string; command: string }
  | { kind: "fetch"; content: string; url: string }
  | { kind: "read-file"; content: string; filePath: string }
  | {
      kind: "write-file";
      content: string;
      filePath: string;
      fileContent: string;
    };

export function parseResponse(text: string): ParsedResponse {
  type Candidate = {
    index: number;
    kind: "changes" | "shell" | "fetch" | "read-file" | "write-file";
    match: RegExpExecArray;
  };
  const candidates: Candidate[] = [];

  const patterns: { kind: Candidate["kind"]; re: RegExp }[] = [
    { kind: "fetch", re: /<fetch>([\s\S]*?)<\/fetch>/g },
    { kind: "shell", re: /<shell>([\s\S]*?)<\/shell>/g },
    { kind: "read-file", re: /<read-file>([\s\S]*?)<\/read-file>/g },
    { kind: "write-file", re: /<write-file>([\s\S]*?)<\/write-file>/g },
    { kind: "changes", re: /<changes>([\s\S]*?)<\/changes>/g },

    { kind: "fetch", re: /```fetch\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "shell", re: /```shell\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "read-file", re: /```read-file\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "write-file", re: /```write-file\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "changes", re: /```changes\r?\n([\s\S]*?)\r?\n```/g },
  ];

  for (const { kind, re } of patterns) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) candidates.push({ index: m.index, kind, match: m });
  }

  if (candidates.length === 0) return { kind: "text", content: text.trim() };

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
    } catch {}
  }

  if (kind === "shell") {
    return { kind: "shell", content: before, command: body };
  }

  if (kind === "fetch") {
    const url = body.replace(/^<|>$/g, "").trim();
    return { kind: "fetch", content: before, url };
  }

  if (kind === "read-file") {
    return { kind: "read-file", content: before, filePath: body };
  }

  if (kind === "write-file") {
    try {
      const parsed = JSON.parse(body) as { path: string; content: string };
      return {
        kind: "write-file",
        content: before,
        filePath: parsed.path,
        fileContent: parsed.content,
      };
    } catch {}
  }

  return { kind: "text", content: text.trim() };
}

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
          : m.toolName === "fetch"
            ? `fetch of ${m.content}`
            : m.toolName === "read-file"
              ? `read-file of ${m.content}`
              : `write-file to ${m.content}`;
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
  const apiMessages = [...FEW_SHOT_MESSAGES, ...buildApiMessages(messages)];

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

export function extractGithubUrl(text: string): string | null {
  const match = text.match(/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/);
  return match ? match[0]! : null;
}

export function toCloneUrl(url: string): string {
  const clean = url.replace(/\/+$/, "");
  return clean.endsWith(".git") ? clean : `${clean}.git`;
}

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

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTables(html: string): string {
  const tables: string[] = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let tMatch: RegExpExecArray | null;

  while ((tMatch = tableRe.exec(html)) !== null) {
    const tableHtml = tMatch[0]!;
    const rows: string[][] = [];

    const rowRe = /<tr[\s\S]*?<\/tr>/gi;
    let rMatch: RegExpExecArray | null;
    while ((rMatch = rowRe.exec(tableHtml)) !== null) {
      const cells: string[] = [];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = cellRe.exec(rMatch[0]!)) !== null) {
        cells.push(stripTags(cMatch[1] ?? ""));
      }
      if (cells.length > 0) rows.push(cells);
    }

    if (rows.length < 2) continue;

    const cols = Math.max(...rows.map((r) => r.length));
    const padded = rows.map((r) => {
      while (r.length < cols) r.push("");
      return r;
    });
    const widths = Array.from({ length: cols }, (_, ci) =>
      Math.max(...padded.map((r) => (r[ci] ?? "").length), 3),
    );
    const fmt = (r: string[]) =>
      r.map((c, ci) => c.padEnd(widths[ci] ?? 0)).join(" | ");
    const header = fmt(padded[0]!);
    const sep = widths.map((w) => "-".repeat(w)).join("-|-");
    const body = padded.slice(1).map(fmt).join("\n");
    tables.push(`${header}\n${sep}\n${body}`);
  }

  return tables.length > 0
    ? `=== TABLES (${tables.length}) ===\n\n${tables.join("\n\n---\n\n")}`
    : "";
}

function extractLists(html: string): string {
  const lists: string[] = [];
  const listRe = /<[ou]l[\s\S]*?<\/[ou]l>/gi;
  let lMatch: RegExpExecArray | null;
  while ((lMatch = listRe.exec(html)) !== null) {
    const items: string[] = [];
    const itemRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let iMatch: RegExpExecArray | null;
    while ((iMatch = itemRe.exec(lMatch[0]!)) !== null) {
      const text = stripTags(iMatch[1] ?? "");
      if (text.length > 2) items.push(`• ${text}`);
    }
    if (items.length > 1) lists.push(items.join("\n"));
  }
  return lists.length > 0
    ? `=== LISTS ===\n\n${lists.slice(0, 5).join("\n\n")}`
    : "";
}

export async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await res.json();
    return JSON.stringify(json, null, 2).slice(0, 8000);
  }

  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]!) : "No title";

  const tables = extractTables(html);
  const lists = extractLists(html);
  const bodyText = stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, ""),
  )
    .replace(/\s{3,}/g, "\n\n")
    .slice(0, 3000);

  const parts = [`PAGE: ${title}`, `URL: ${url}`];
  if (tables) parts.push(tables);
  if (lists) parts.push(lists);
  parts.push(`=== TEXT ===\n${bodyText}`);

  return parts.join("\n\n");
}

export function readFile(filePath: string, repoPath: string): string {
  const candidates = [filePath, path.join(repoPath, filePath)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const content = readFileSync(candidate, "utf-8");
        const lines = content.split("\n").length;
        return `File: ${filePath} (${lines} lines)\n\n${content.slice(0, 8000)}${
          content.length > 8000 ? "\n\n… (truncated)" : ""
        }`;
      } catch (err) {
        return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }
  return `File not found: ${filePath}`;
}

export function writeFile(
  filePath: string,
  content: string,
  repoPath: string,
): string {
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(repoPath, filePath);
  try {
    const dir = path.dirname(fullPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
    const lines = content.split("\n").length;
    return `Written: ${fullPath} (${lines} lines, ${content.length} bytes)`;
  } catch (err) {
    return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
  }
}
