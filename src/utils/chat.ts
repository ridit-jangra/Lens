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

// ── Prompt builder ────────────────────────────────────────────────────────────

export function buildSystemPrompt(
  files: ImportantFile[],
  historySummary = "",
): string {
  const fileList = files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``)
    .join("\n\n");

  return `You are an expert software engineer assistant with access to the user's codebase and six tools.

## TOOLS

You have exactly six tools. To use a tool you MUST wrap it in the exact XML tags shown below — no other format will work.

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

### 5. search — search the internet for anything you are unsure about
<search>how to use React useEffect cleanup function</search>

### 6. clone — clone a GitHub repo so you can explore and discuss it
<clone>https://github.com/owner/repo</clone>

### 7. changes — propose code edits (shown as a diff for user approval)
<changes>
{"summary": "what changed and why", "patches": [{"path": "src/foo.ts", "content": "COMPLETE file content", "isNew": false}]}
</changes>

## RULES

1. When you need to use a tool, output ONLY the XML tag — nothing before or after it in that response
2. ONE tool per response — emit the tag, then stop completely
3. After the user approves and you get the result, continue your analysis in the next response
4. NEVER print a URL, command, filename, or JSON blob as plain text when you should be using a tool
5. NEVER say "I'll fetch" / "run this command" / "here's the write-file" — just emit the tag
6. NEVER use shell to run git clone — always use the clone tag instead
7. write-file content field must be the COMPLETE file content, never empty or placeholder
8. After a write-file succeeds, do NOT repeat it — trust the result and move on
9. After a write-file succeeds, use read-file to verify the content before telling the user it is done
10. NEVER apologize and redo a tool call you already made — if write-file or shell ran and returned a result, it worked, do not run it again
11. NEVER say "I made a mistake" and repeat the same tool — one attempt is enough, trust the output
12. NEVER second-guess yourself mid-response — commit to your answer
13. Every shell command runs from the repo root — \`cd\` has NO persistent effect. NEVER use \`cd\` alone. Use full paths or combine with && e.g. \`cd list && bun run index.ts\`
14. write-file paths are relative to the repo root — if creating files in a subfolder write the full relative path e.g. \`list/src/index.tsx\` NOT \`src/index.tsx\`
15. When scaffolding a new project in a subfolder, ALL write-file paths must start with that subfolder name e.g. \`list/package.json\`, \`list/src/index.tsx\`
16. For JSX/TSX files always use \`.tsx\` extension and include \`/** @jsxImportSource react */\` or ensure tsconfig has jsx set — bun needs this to parse JSX

## SCAFFOLDING A NEW PROJECT (follow this exactly)

When the user asks to create a new CLI/app in a subfolder (e.g. "make a todo app called list"):
1. Create all files first using write-file with paths like \`list/package.json\`, \`list/src/index.tsx\`
2. Then run \`cd list && bun install\` (or npm/pnpm) in one shell command
3. Then run the project with \`cd list && bun run index.ts\` or whatever the entry point is
4. NEVER run \`bun init\` — it is interactive and will hang. Create package.json manually with write-file instead
5. TSX files need either tsconfig.json with \`"jsx": "react-jsx"\` or \`/** @jsxImportSource react */\` at the top

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
- User shares a GitHub URL and wants to clone/explore/discuss it → use clone immediately, NEVER use shell git clone
- After clone succeeds, you will see context about the clone in the conversation. Wait for the user to ask a specific question before using any tools. Do NOT auto-read files, do NOT emit any tool tags until the user asks.
- You are unsure about an API, library, error, concept, or piece of code → search it immediately
- User asks about something recent or that you might not know → search it immediately
- You are about to say "I'm not sure" or "I don't know" → search instead of guessing

## CODEBASE

${fileList.length > 0 ? fileList : "(no files indexed)"}

${historySummary}`;
}

// ── Few-shot examples ─────────────────────────────────────────────────────────

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
      'Here is the output from read-file of ts-info.json:\n\nFile: ts-info.json (1 lines)\n\n{"name":"TypeScript","stars":100000}\n\nPlease continue your response based on this output.',
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
  {
    role: "user",
    content: "clone https://github.com/facebook/react",
  },
  {
    role: "assistant",
    content: "<clone>https://github.com/facebook/react</clone>",
  },
  {
    role: "user",
    content:
      "Cloned react to /tmp/react — 2847 files available. You can now read files from this repo using read-file with paths relative to /tmp/react.",
  },
  {
    role: "assistant",
    content:
      "Cloned! The React repo has 2847 files. I can read source files, explain how it works, or suggest improvements — just ask.",
  },
  {
    role: "user",
    content: "what does the ?? operator do in typescript",
  },
  {
    role: "assistant",
    content: "<search>nullish coalescing operator ?? TypeScript</search>",
  },
  {
    role: "user",
    content:
      'Here is the output from web search for "nullish coalescing operator ?? TypeScript":\n\nAnswer: The ?? operator returns the right-hand side when the left-hand side is null or undefined.\n\nPlease continue your response based on this output.',
  },
  {
    role: "assistant",
    content:
      "The `??` operator is the nullish coalescing operator. It returns the right side only when the left side is `null` or `undefined`.",
  },
];

// ── Response parser ───────────────────────────────────────────────────────────

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
    }
  | { kind: "search"; content: string; query: string }
  | { kind: "clone"; content: string; repoUrl: string };

export function parseResponse(text: string): ParsedResponse {
  type Candidate = {
    index: number;
    kind:
      | "changes"
      | "shell"
      | "fetch"
      | "read-file"
      | "write-file"
      | "search"
      | "clone";
    match: RegExpExecArray;
  };
  const candidates: Candidate[] = [];

  const patterns: { kind: Candidate["kind"]; re: RegExp }[] = [
    { kind: "fetch", re: /<fetch>([\s\S]*?)<\/fetch>/g },
    { kind: "shell", re: /<shell>([\s\S]*?)<\/shell>/g },
    { kind: "read-file", re: /<read-file>([\s\S]*?)<\/read-file>/g },
    { kind: "write-file", re: /<write-file>([\s\S]*?)<\/write-file>/g },
    { kind: "search", re: /<search>([\s\S]*?)<\/search>/g },
    { kind: "clone", re: /<clone>([\s\S]*?)<\/clone>/g },
    { kind: "changes", re: /<changes>([\s\S]*?)<\/changes>/g },
    { kind: "fetch", re: /```fetch\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "shell", re: /```shell\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "read-file", re: /```read-file\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "write-file", re: /```write-file\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "search", re: /```search\r?\n([\s\S]*?)\r?\n```/g },
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
    } catch {
      // fall through
    }
  }

  if (kind === "shell")
    return { kind: "shell", content: before, command: body };

  if (kind === "fetch") {
    const url = body.replace(/^<|>$/g, "").trim();
    return { kind: "fetch", content: before, url };
  }

  if (kind === "read-file")
    return { kind: "read-file", content: before, filePath: body };

  if (kind === "write-file") {
    try {
      const parsed = JSON.parse(body) as { path: string; content: string };
      return {
        kind: "write-file",
        content: before,
        filePath: parsed.path,
        fileContent: parsed.content,
      };
    } catch {
      // fall through
    }
  }

  if (kind === "search")
    return { kind: "search", content: before, query: body };

  if (kind === "clone") {
    const url = body.replace(/^<|>$/g, "").trim();
    return { kind: "clone", content: before, repoUrl: url };
  }

  return { kind: "text", content: text.trim() };
}

// ── Clone tag helper ──────────────────────────────────────────────────────────

export function parseCloneTag(text: string): string | null {
  const m = text.match(/<clone>([\s\S]*?)<\/clone>/);
  return m ? m[1]!.trim() : null;
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
          : m.toolName === "fetch"
            ? `fetch of ${m.content}`
            : m.toolName === "read-file"
              ? `read-file of ${m.content}`
              : m.toolName === "search"
                ? `web search for "${m.content}"`
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timer);
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

// ── Clipboard read ────────────────────────────────────────────────────────────

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
  return new Promise((resolve) => {
    // Use spawn so we can stream stdout+stderr and impose no hard cap on
    // long-running commands (pip install, python scripts, git commit, etc.)
    // We still cap at 5 minutes to avoid hanging forever.
    const { spawn } =
      require("child_process") as typeof import("child_process");
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const shellFlag = isWin ? "/c" : "-c";

    const proc = spawn(shell, [shellFlag, command], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errChunks.push(d));

    const killTimer = setTimeout(
      () => {
        proc.kill();
        resolve("(command timed out after 5 minutes)");
      },
      5 * 60 * 1000,
    );

    proc.on("close", (code: number | null) => {
      clearTimeout(killTimer);
      const stdout = Buffer.concat(chunks).toString("utf-8").trim();
      const stderr = Buffer.concat(errChunks).toString("utf-8").trim();
      const combined = [stdout, stderr].filter(Boolean).join("\n");
      resolve(combined || (code === 0 ? "(no output)" : `exit code ${code}`));
    });

    proc.on("error", (err: Error) => {
      clearTimeout(killTimer);
      resolve(`Error: ${err.message}`);
    });
  });
}

// ── HTML table / list extractor ───────────────────────────────────────────────

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

// ── Web search ────────────────────────────────────────────────────────────────

export async function searchWeb(query: string): Promise<string> {
  const encoded = encodeURIComponent(query);

  const ddgUrl = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
  try {
    const res = await fetch(ddgUrl, {
      headers: { "User-Agent": "Lens/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        RelatedTopics?: { Text?: string; FirstURL?: string }[];
        Answer?: string;
        Infobox?: { content?: { label: string; value: string }[] };
      };

      const parts: string[] = [`Search: ${query}`];
      if (data.Answer) parts.push(`Answer: ${data.Answer}`);
      if (data.AbstractText) {
        parts.push(`Summary: ${data.AbstractText}`);
        if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}`);
      }
      if (data.Infobox?.content?.length) {
        const fields = data.Infobox.content
          .slice(0, 8)
          .map((f) => `  ${f.label}: ${f.value}`)
          .join("\n");
        parts.push(`Info:\n${fields}`);
      }
      if (data.RelatedTopics?.length) {
        const topics = (data.RelatedTopics as { Text?: string }[])
          .filter((t) => t.Text)
          .slice(0, 5)
          .map((t) => `  - ${t.Text}`)
          .join("\n");
        if (topics) parts.push(`Related:\n${topics}`);
      }

      const result = parts.join("\n\n");
      if (result.length > 60) return result;
    }
  } catch {
    // fall through to HTML scrape
  }

  try {
    const htmlUrl = `https://html.duckduckgo.com/html/?q=${encoded}`;
    const res = await fetch(htmlUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const snippets: string[] = [];
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = snippetRe.exec(html)) !== null && snippets.length < 6) {
      const text = m[1]!
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 20) snippets.push(`- ${text}`);
    }

    const links: string[] = [];
    const linkRe = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    while ((m = linkRe.exec(html)) !== null && links.length < 5) {
      const title = m[2]!.replace(/<[^>]+>/g, "").trim();
      const href = m[1]!;
      if (title && href) links.push(`  ${title} \u2014 ${href}`);
    }

    if (snippets.length === 0 && links.length === 0) {
      return `No results found for: ${query}`;
    }

    const parts = [`Search results for: ${query}`];
    if (snippets.length > 0) parts.push(`Snippets:\n${snippets.join("\n")}`);
    if (links.length > 0) parts.push(`Links:\n${links.join("\n")}`);
    return parts.join("\n\n");
  } catch (err) {
    return `Search failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── File tools ────────────────────────────────────────────────────────────────

export function readFile(filePath: string, repoPath: string): string {
  const candidates = path.isAbsolute(filePath)
    ? [filePath]
    : [filePath, path.join(repoPath, filePath)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const content = readFileSync(candidate, "utf-8");
        const lines = content.split("\n").length;
        return `File: ${candidate} (${lines} lines)\n\n${content.slice(0, 8000)}${
          content.length > 8000 ? "\n\n… (truncated)" : ""
        }`;
      } catch (err) {
        return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }
  return `File not found: ${filePath}. If reading from a cloned repo, use the full absolute path e.g. C:\\Users\\...\\repo\\file.ts`;
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
