export {
  walkDir,
  applyPatches,
  readFile,
  readFolder,
  grepFiles,
  writeFile,
  deleteFile,
  deleteFolder,
} from "../tools/files";
export { runShell, readClipboard, openUrl } from "../tools/shell";
export { fetchUrl, searchWeb } from "../tools/web";
export { generatePdf } from "../tools/pdf";
export { buildSystemPrompt, FEW_SHOT_MESSAGES } from "../prompts";

import type { FilePatch } from "../components/repo/DiffViewer";
import type { Message } from "../types/chat";
import type { Provider } from "../types/config";
import { FEW_SHOT_MESSAGES } from "../prompts";

// ── Response parser ───────────────────────────────────────────────────────────

export type ParsedResponse =
  | { kind: "text"; content: string }
  | { kind: "changes"; content: string; patches: FilePatch[] }
  | { kind: "shell"; content: string; command: string }
  | { kind: "fetch"; content: string; url: string }
  | { kind: "read-file"; content: string; filePath: string }
  | { kind: "read-folder"; content: string; folderPath: string }
  | { kind: "grep"; content: string; pattern: string; glob: string }
  | { kind: "delete-file"; content: string; filePath: string }
  | { kind: "delete-folder"; content: string; folderPath: string }
  | { kind: "open-url"; content: string; url: string }
  | {
      kind: "generate-pdf";
      content: string;
      filePath: string;
      pdfContent: string;
    }
  | {
      kind: "write-file";
      content: string;
      filePath: string;
      fileContent: string;
    }
  | { kind: "search"; content: string; query: string }
  | { kind: "clone"; content: string; repoUrl: string };

export function parseResponse(text: string): ParsedResponse {
  const scanText = text.replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length));

  type Candidate = {
    index: number;
    kind:
      | "changes"
      | "shell"
      | "fetch"
      | "read-file"
      | "read-folder"
      | "grep"
      | "delete-file"
      | "delete-folder"
      | "open-url"
      | "generate-pdf"
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
    { kind: "read-folder", re: /<read-folder>([\s\S]*?)<\/read-folder>/g },
    { kind: "grep", re: /<grep>([\s\S]*?)<\/grep>/g },
    { kind: "delete-file", re: /<delete-file>([\s\S]*?)<\/delete-file>/g },
    {
      kind: "delete-folder",
      re: /<delete-folder>([\s\S]*?)<\/delete-folder>/g,
    },
    { kind: "open-url", re: /<open-url>([\s\S]*?)<\/open-url>/g },
    { kind: "generate-pdf", re: /<generate-pdf>([\s\S]*?)<\/generate-pdf>/g },
    { kind: "write-file", re: /<write-file>([\s\S]*?)<\/write-file>/g },
    { kind: "search", re: /<search>([\s\S]*?)<\/search>/g },
    { kind: "clone", re: /<clone>([\s\S]*?)<\/clone>/g },
    { kind: "changes", re: /<changes>([\s\S]*?)<\/changes>/g },
    // fenced fallbacks
    { kind: "fetch", re: /```fetch\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "shell", re: /```shell\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "read-file", re: /```read-file\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "read-folder", re: /```read-folder\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "write-file", re: /```write-file\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "search", re: /```search\r?\n([\s\S]*?)\r?\n```/g },
    { kind: "changes", re: /```changes\r?\n([\s\S]*?)\r?\n```/g },
  ];

  for (const { kind, re } of patterns) {
    re.lastIndex = 0;
    const m = re.exec(scanText);
    if (m) {
      const originalRe = new RegExp(re.source, re.flags.replace("g", ""));
      const originalMatch = originalRe.exec(text.slice(m.index));
      if (originalMatch) {
        const fakeMatch = Object.assign(
          [
            text.slice(m.index, m.index + originalMatch[0].length),
            originalMatch[1],
          ] as unknown as RegExpExecArray,
          { index: m.index, input: text, groups: undefined },
        );
        candidates.push({ index: m.index, kind, match: fakeMatch });
      }
    }
  }

  if (candidates.length === 0) return { kind: "text", content: text.trim() };

  candidates.sort((a, b) => a.index - b.index);
  const { kind, match } = candidates[0]!;

  const before = text
    .slice(0, match.index)
    .replace(
      /<(fetch|shell|read-file|read-folder|write-file|search|clone|changes)[^>]*>[\s\S]*?<\/\1>/g,
      "",
    )
    .trim();
  const body = (match[1] ?? "").trim();

  if (kind === "changes") {
    try {
      const parsed = JSON.parse(body) as {
        summary: string;
        patches: FilePatch[];
      };
      const display = [before, parsed.summary].filter(Boolean).join("\n\n");
      return { kind: "changes", content: display, patches: parsed.patches };
    } catch {
      /* fall through */
    }
  }

  if (kind === "shell")
    return { kind: "shell", content: before, command: body };
  if (kind === "fetch")
    return {
      kind: "fetch",
      content: before,
      url: body.replace(/^<|>$/g, "").trim(),
    };
  if (kind === "read-file")
    return { kind: "read-file", content: before, filePath: body };
  if (kind === "read-folder")
    return { kind: "read-folder", content: before, folderPath: body };
  if (kind === "delete-file")
    return { kind: "delete-file", content: before, filePath: body };
  if (kind === "delete-folder")
    return { kind: "delete-folder", content: before, folderPath: body };
  if (kind === "open-url")
    return {
      kind: "open-url",
      content: before,
      url: body.replace(/^<|>$/g, "").trim(),
    };
  if (kind === "search")
    return { kind: "search", content: before, query: body };
  if (kind === "clone")
    return {
      kind: "clone",
      content: before,
      repoUrl: body.replace(/^<|>$/g, "").trim(),
    };

  if (kind === "generate-pdf") {
    try {
      const parsed = JSON.parse(body);
      return {
        kind: "generate-pdf",
        content: before,
        filePath: parsed.path ?? parsed.filePath ?? "output.pdf",
        pdfContent: parsed.content ?? "",
      };
    } catch {
      return { kind: "text", content: text };
    }
  }

  if (kind === "grep") {
    try {
      const parsed = JSON.parse(body) as { pattern: string; glob?: string };
      return {
        kind: "grep",
        content: before,
        pattern: parsed.pattern,
        glob: parsed.glob ?? "**/*",
      };
    } catch {
      return { kind: "grep", content: before, pattern: body, glob: "**/*" };
    }
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
    } catch {
      /* fall through */
    }
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
              : m.toolName === "read-folder"
                ? `read-folder of ${m.content}`
                : m.toolName === "grep"
                  ? `grep for "${m.content}"`
                  : m.toolName === "delete-file"
                    ? `delete-file of ${m.content}`
                    : m.toolName === "delete-folder"
                      ? `delete-folder of ${m.content}`
                      : m.toolName === "open-url"
                        ? `open-url ${m.content}`
                        : m.toolName === "generate-pdf"
                          ? `generate-pdf to ${m.content}`
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
  abortSignal?: AbortSignal,
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
  abortSignal?.addEventListener("abort", () => controller.abort());

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
