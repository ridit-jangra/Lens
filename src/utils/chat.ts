// ── chat.ts ───────────────────────────────────────────────────────────────────
//
// Response parsing and API calls.
// Tool parsing is now fully driven by the ToolRegistry — adding a new tool
// to the registry automatically makes it parseable here.

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

import type { Message } from "../types/chat";
import type { Provider } from "../types/config";
import { FEW_SHOT_MESSAGES } from "../prompts";
import { registry } from "../utils/tools/registry";
import type { FilePatch } from "../components/repo/DiffViewer";

export type ParsedResponse =
  | { kind: "text"; content: string; remainder?: string }
  | {
      kind: "changes";
      content: string;
      patches: FilePatch[];
      remainder?: string;
    }
  | { kind: "clone"; content: string; repoUrl: string; remainder?: string }
  | {
      kind: "tool";
      toolName: string;
      input: unknown;
      rawInput: string;
      content: string;
      remainder?: string;
    };

export function parseResponse(text: string): ParsedResponse {
  const scanText = text.replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length));

  type Candidate = {
    index: number;
    toolName: string;
    match: RegExpExecArray;
  };
  const candidates: Candidate[] = [];

  for (const toolName of registry.names()) {
    const escaped = toolName.replace(/[-]/g, "\\-");

    // XML tag
    const xmlRe = new RegExp(`<${escaped}>([\\s\\S]*?)<\\/${escaped}>`, "g");
    xmlRe.lastIndex = 0;
    const xmlM = xmlRe.exec(scanText);
    if (xmlM) {
      const orig = new RegExp(xmlRe.source);
      const origM = orig.exec(text.slice(xmlM.index));
      if (origM) {
        candidates.push({
          index: xmlM.index,
          toolName,
          match: Object.assign(
            [
              text.slice(xmlM.index, xmlM.index + origM[0].length),
              origM[1],
            ] as unknown as RegExpExecArray,
            { index: xmlM.index, input: text, groups: undefined },
          ),
        });
      }
    }

    // Fenced code block fallback
    const fencedRe = new RegExp(
      `\`\`\`${escaped}\\r?\\n([\\s\\S]*?)\\r?\\n\`\`\``,
      "g",
    );
    fencedRe.lastIndex = 0;
    const fencedM = fencedRe.exec(scanText);
    if (fencedM) {
      const orig = new RegExp(fencedRe.source);
      const origM = orig.exec(text.slice(fencedM.index));
      if (origM) {
        candidates.push({
          index: fencedM.index,
          toolName,
          match: Object.assign(
            [
              text.slice(fencedM.index, fencedM.index + origM[0].length),
              origM[1],
            ] as unknown as RegExpExecArray,
            { index: fencedM.index, input: text, groups: undefined },
          ),
        });
      }
    }
  }

  if (candidates.length === 0) return { kind: "text", content: text.trim() };

  candidates.sort((a, b) => a.index - b.index);
  const { toolName, match } = candidates[0]!;

  const before = text.slice(0, match.index).trim();
  const body = (match[1] ?? "").trim();
  const afterMatch = text.slice(match.index + match[0].length).trim();
  const remainder = afterMatch.length > 0 ? afterMatch : undefined;

  // Special UI variants
  if (toolName === "changes") {
    try {
      const parsed = JSON.parse(body) as {
        summary: string;
        patches: FilePatch[];
      };
      const display = [before, parsed.summary].filter(Boolean).join("\n\n");
      return {
        kind: "changes",
        content: display,
        patches: parsed.patches,
        remainder,
      };
    } catch {
      return { kind: "text", content: text.trim() };
    }
  }

  if (toolName === "clone") {
    return {
      kind: "clone",
      content: before,
      repoUrl: body.replace(/^<|>$/g, "").trim(),
      remainder,
    };
  }

  // Generic tool
  const tool = registry.get(toolName);
  if (!tool) return { kind: "text", content: text.trim() };

  const input = tool.parseInput(body);
  if (input === null) return { kind: "text", content: text.trim() };

  return {
    kind: "tool",
    toolName,
    input,
    rawInput: body,
    content: before,
    remainder,
  };
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
      return {
        role: "user",
        content: `Here is the output from the ${m.toolName} of ${m.content}:\n\n${m.result}\n\nPlease continue your response based on this output.`,
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
