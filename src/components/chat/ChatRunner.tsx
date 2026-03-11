import React from "react";
import { Box, Text, useInput, Static } from "ink";
import Spinner from "ink-spinner";
import figures from "figures";
import { useState } from "react";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { execSync } from "child_process";
import { ORANGE } from "../../colors";
import { DiffViewer, buildDiffs } from "../repo/DiffViewer";
import { ProviderPicker } from "../repo/ProviderPicker";
import type { DiffLine, FilePatch } from "../repo/DiffViewer";
import type { Provider } from "../../types/config";
import type { ImportantFile } from "../../types/repo";
import { fetchFileTree, readImportantFiles } from "../../utils/files";
import { readdirSync, statSync } from "fs";
import { useThinkingPhrase } from "../../utils/thinking";

type Role = "user" | "assistant";

type Message =
  | { role: Role; content: string; type: "text" }
  | {
      role: "assistant";
      content: string;
      type: "plan";
      patches: FilePatch[];
      applied: boolean;
    }
  | {
      role: "assistant";
      content: string;
      type: "tool";
      toolName: string;
      result: string;
      approved: boolean;
    };

type ToolCall =
  | { type: "shell"; command: string }
  | { type: "fetch"; url: string };

type ChatStage =
  | { type: "picking-provider" }
  | { type: "loading" }
  | { type: "idle" }
  | { type: "thinking" }
  | {
      type: "preview";
      patches: FilePatch[];
      diffLines: DiffLine[][];
      scrollOffset: number;
    }
  | {
      type: "viewing-file";
      file: { path: string; isNew: boolean; patch: FilePatch };
      diffLines: DiffLine[];
      scrollOffset: number;
    }
  | {
      type: "permission";
      tool: ToolCall;
      pendingMessages: Message[];
      resolve: (approved: boolean) => void;
    };

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

function walkDir(dir: string, base = dir): string[] {
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

// ── Tool execution ────────────────────────────────────────────────────────────

async function runShell(command: string, cwd: string): Promise<string> {
  try {
    const out = execSync(command, { cwd, timeout: 15000, encoding: "utf-8" });
    return out.trim() || "(no output)";
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const combined = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
    return combined || e.message || "Command failed";
  }
}

async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Lens/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  // Strip tags, collapse whitespace, truncate
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

// ── Prompt builder ─────────────────────────────────────────────────────────

function buildSystemPrompt(files: ImportantFile[]): string {
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

type ParsedResponse =
  | { kind: "text"; content: string }
  | { kind: "changes"; content: string; patches: FilePatch[] }
  | { kind: "shell"; content: string; command: string }
  | { kind: "fetch"; content: string; url: string };

function parseResponse(text: string): ParsedResponse {
  // Check for changes block
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

  // Check for shell block
  const shellMatch = text.match(/```shell\n([\s\S]*?)\n```/);
  if (shellMatch) {
    const command = shellMatch[1]!.trim();
    const before = text.slice(0, text.indexOf("```shell")).trim();
    return { kind: "shell", content: before, command };
  }

  // Check for fetch block
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
      // Tool results are injected as user messages so the model sees them
      return {
        role: "user",
        content: `Tool result (${m.toolName}):\n${m.result}`,
      };
    }
    return { role: m.role, content: m.content };
  });
}

async function callChat(
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

function applyPatches(repoPath: string, patches: FilePatch[]) {
  for (const patch of patches) {
    const fullPath = path.join(repoPath, patch.path);
    const dir = path.dirname(fullPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, patch.content, "utf-8");
  }
}

// ── Static message renderer ───────────────────────────────────────────────────

function StaticMessage({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          you{" "}
        </Text>
        <Text color="white">{msg.content}</Text>
      </Box>
    );
  }

  if (msg.type === "tool") {
    const icon = msg.toolName === "shell" ? "$" : "↗";
    const label =
      msg.toolName === "shell" ? msg.content : msg.content || msg.toolName;
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1}>
          <Text color="magenta" bold>
            {icon}
          </Text>
          <Text color="magenta">{label}</Text>
          {!msg.approved && <Text color="red">(denied)</Text>}
        </Box>
        {msg.approved && (
          <Box marginLeft={2}>
            <Text color="gray" dimColor>
              {msg.result.slice(0, 200)}
              {msg.result.length > 200 ? "…" : ""}
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  if (msg.type === "plan") {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color={ORANGE} bold>
            lens{" "}
          </Text>
          <Text color="white">{msg.content}</Text>
        </Box>
        <Box marginLeft={5} gap={1}>
          <Text color={msg.applied ? "green" : "yellow"}>
            {msg.applied ? figures.tick : figures.bullet}
          </Text>
          <Text color={msg.applied ? "green" : "yellow"}>
            {msg.applied ? "Changes applied" : "Changes skipped"}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box marginBottom={1}>
      <Text color={ORANGE} bold>
        lens{" "}
      </Text>
      <Text color="white">{msg.content}</Text>
    </Box>
  );
}

// ── Permission prompt ─────────────────────────────────────────────────────────

function PermissionPrompt({
  tool,
  onDecide,
}: {
  tool: ToolCall;
  onDecide: (approved: boolean) => void;
}) {
  useInput((input, key) => {
    if (input === "y" || input === "Y" || key.return) onDecide(true);
    if (input === "n" || input === "N" || key.escape) onDecide(false);
  });

  const isShell = tool.type === "shell";
  return (
    <Box
      flexDirection="column"
      gap={1}
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      marginY={1}
    >
      <Text bold color="yellow">
        {figures.warning} Permission Request
      </Text>
      <Box gap={1}>
        <Text color="gray">{isShell ? "Run command:" : "Fetch URL:"}</Text>
        <Text color={isShell ? "red" : "cyan"} bold>
          {isShell
            ? (tool as { type: "shell"; command: string }).command
            : (tool as { type: "fetch"; url: string }).url}
        </Text>
      </Box>
      <Text color="gray">Y/enter to allow · N/esc to deny</Text>
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export const ChatRunner = ({ repoPath }: { repoPath: string }) => {
  const [stage, setStage] = useState<ChatStage>({ type: "picking-provider" });
  const [committed, setCommitted] = useState<Message[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [pendingMsgIndex, setPendingMsgIndex] = useState<number | null>(null);
  const [allMessages, setAllMessages] = useState<Message[]>([]);

  const thinkingPhrase = useThinkingPhrase(stage.type === "thinking");

  // Core: process a raw model response, handling tool calls recursively
  const processResponse = (raw: string, currentAll: Message[]) => {
    const parsed = parseResponse(raw);

    if (parsed.kind === "changes") {
      if (parsed.patches.length === 0) {
        const msg: Message = {
          role: "assistant",
          content: parsed.content,
          type: "text",
        };
        setAllMessages([...currentAll, msg]);
        setCommitted((prev) => [...prev, msg]);
        setStage({ type: "idle" });
        return;
      }
      const assistantMsg: Message = {
        role: "assistant",
        content: parsed.content,
        type: "plan",
        patches: parsed.patches,
        applied: false,
      };
      const withAssistant = [...currentAll, assistantMsg];
      setAllMessages(withAssistant);
      setPendingMsgIndex(withAssistant.length - 1);
      const diffLines = buildDiffs(repoPath, parsed.patches);
      setStage({
        type: "preview",
        patches: parsed.patches,
        diffLines,
        scrollOffset: 0,
      });
      return;
    }

    if (parsed.kind === "shell" || parsed.kind === "fetch") {
      const tool: ToolCall =
        parsed.kind === "shell"
          ? { type: "shell", command: parsed.command }
          : { type: "fetch", url: parsed.url };

      // Show any preamble text the model wrote before the tool call
      if (parsed.content) {
        const preambleMsg: Message = {
          role: "assistant",
          content: parsed.content,
          type: "text",
        };
        setAllMessages([...currentAll, preambleMsg]);
        setCommitted((prev) => [...prev, preambleMsg]);
      }

      setStage({
        type: "permission",
        tool,
        pendingMessages: currentAll,
        resolve: async (approved: boolean) => {
          let result = "(denied by user)";

          if (approved) {
            try {
              setStage({ type: "thinking" });
              result =
                parsed.kind === "shell"
                  ? await runShell(parsed.command, repoPath)
                  : await fetchUrl(parsed.url);
            } catch (err: unknown) {
              result = `Error: ${err instanceof Error ? err.message : "failed"}`;
            }
          }

          const toolMsg: Message = {
            role: "assistant",
            type: "tool",
            toolName: parsed.kind,
            content: parsed.kind === "shell" ? parsed.command : parsed.url,
            result,
            approved,
          };

          const withTool = [...currentAll, toolMsg];
          setAllMessages(withTool);
          setCommitted((prev) => [...prev, toolMsg]);

          if (!approved) {
            // Tell the model it was denied, continue conversation
            const denyNote: Message = {
              role: "user",
              content: "Tool call was denied by user.",
              type: "text",
            };
            const withDeny = [...withTool, denyNote];
            setAllMessages(withDeny);
            setStage({ type: "thinking" });
            callChat(provider!, systemPrompt, withDeny)
              .then((r) => processResponse(r, withDeny))
              .catch(handleError(withDeny));
          } else {
            // Feed result back to model
            setStage({ type: "thinking" });
            callChat(provider!, systemPrompt, withTool)
              .then((r) => processResponse(r, withTool))
              .catch(handleError(withTool));
          }
        },
      });
      return;
    }

    // Plain text
    const msg: Message = {
      role: "assistant",
      content: parsed.content,
      type: "text",
    };
    setAllMessages([...currentAll, msg]);
    setCommitted((prev) => [...prev, msg]);
    setStage({ type: "idle" });
  };

  const handleError = (currentAll: Message[]) => (err: unknown) => {
    const errMsg: Message = {
      role: "assistant",
      content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}`,
      type: "text",
    };
    setAllMessages([...currentAll, errMsg]);
    setCommitted((prev) => [...prev, errMsg]);
    setStage({ type: "idle" });
  };

  const sendMessage = (text: string) => {
    if (!provider) return;
    const userMsg: Message = { role: "user", content: text, type: "text" };
    const nextAll = [...allMessages, userMsg];
    setCommitted((prev) => [...prev, userMsg]);
    setAllMessages(nextAll);
    setStage({ type: "thinking" });
    callChat(provider, systemPrompt, nextAll)
      .then((raw) => processResponse(raw, nextAll))
      .catch(handleError(nextAll));
  };

  useInput((input, key) => {
    if (stage.type === "idle") {
      if (key.ctrl && input === "c") {
        process.exit(0);
        return;
      }
      if (key.return) {
        if (inputValue.trim()) {
          const t = inputValue.trim();
          setInputValue("");
          sendMessage(t);
        }
        return;
      }
      if (key.backspace || key.delete) {
        setInputValue((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setInputValue((v) => v + input);
      }
      return;
    }

    if (stage.type === "permission") {
      const { resolve } = stage;
      if (input === "y" || input === "Y" || key.return) {
        resolve(true);
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        resolve(false);
        return;
      }
      return;
    }

    if (stage.type === "preview") {
      if (key.upArrow) {
        setStage({
          ...stage,
          scrollOffset: Math.max(0, stage.scrollOffset - 1),
        });
        return;
      }
      if (key.downArrow) {
        setStage({ ...stage, scrollOffset: stage.scrollOffset + 1 });
        return;
      }
      if (key.escape || input === "s" || input === "S") {
        if (pendingMsgIndex !== null) {
          const msg = allMessages[pendingMsgIndex];
          if (msg?.type === "plan")
            setCommitted((prev) => [...prev, { ...msg, applied: false }]);
        }
        setPendingMsgIndex(null);
        setStage({ type: "idle" });
        return;
      }
      if (key.return || input === "a" || input === "A") {
        try {
          applyPatches(repoPath, stage.patches);
        } catch {
          /* non-fatal */
        }
        if (pendingMsgIndex !== null) {
          const msg = allMessages[pendingMsgIndex];
          if (msg?.type === "plan") {
            const applied: Message = { ...msg, applied: true };
            setAllMessages((prev) =>
              prev.map((m, i) => (i === pendingMsgIndex ? applied : m)),
            );
            setCommitted((prev) => [...prev, applied]);
          }
        }
        setPendingMsgIndex(null);
        setStage({ type: "idle" });
        return;
      }
    }

    if (stage.type === "viewing-file") {
      if (key.upArrow) {
        setStage({
          ...stage,
          scrollOffset: Math.max(0, stage.scrollOffset - 1),
        });
        return;
      }
      if (key.downArrow) {
        setStage({ ...stage, scrollOffset: stage.scrollOffset + 1 });
        return;
      }
      if (key.escape || key.return) {
        setStage({ type: "idle" });
        return;
      }
    }
  });

  const handleProviderDone = (p: Provider) => {
    setProvider(p);
    setStage({ type: "loading" });
    fetchFileTree(repoPath)
      .catch(() => walkDir(repoPath))
      .then((fileTree) => {
        const importantFiles = readImportantFiles(repoPath, fileTree);
        const sys = buildSystemPrompt(importantFiles);
        setSystemPrompt(sys);
        const greeting: Message = {
          role: "assistant",
          content: `Codebase loaded — ${importantFiles.length} files indexed. Ask me anything, tell me what to build, or share a URL to review.`,
          type: "text",
        };
        setCommitted([greeting]);
        setAllMessages([greeting]);
        setStage({ type: "idle" });
      })
      .catch(() => setStage({ type: "idle" }));
  };

  if (stage.type === "picking-provider")
    return <ProviderPicker onDone={handleProviderDone} />;

  if (stage.type === "loading") {
    return (
      <Box marginTop={1} gap={1}>
        <Text color={ORANGE}>
          <Spinner />
        </Text>
        <Text>Indexing codebase...</Text>
      </Box>
    );
  }

  if (stage.type === "preview") {
    const { patches, diffLines, scrollOffset } = stage;
    return (
      <Box flexDirection="column" gap={1}>
        <Static items={committed}>
          {(msg, i) => <StaticMessage key={i} msg={msg} />}
        </Static>
        <Text bold color="cyan">
          {figures.info} Proposed Changes
        </Text>
        <Box flexDirection="column">
          {patches.map((p) => (
            <Text key={p.path} color={p.isNew ? "green" : "yellow"}>
              {"  "}
              {p.isNew ? figures.tick : figures.bullet} {p.path}
              {p.isNew && <Text color="gray"> (new)</Text>}
            </Text>
          ))}
        </Box>
        <DiffViewer
          patches={patches}
          diffs={diffLines}
          scrollOffset={scrollOffset}
        />
        <Text color="gray">↑↓ scroll · enter/A to apply · S/esc to skip</Text>
      </Box>
    );
  }

  if (stage.type === "viewing-file") {
    const { file, diffLines, scrollOffset } = stage;
    return (
      <Box flexDirection="column" gap={1}>
        <Static items={committed}>
          {(msg, i) => <StaticMessage key={i} msg={msg} />}
        </Static>
        <Box gap={1}>
          <Text bold color="cyan">
            {file.path}
          </Text>
          <Text color="gray">{file.isNew ? "(new file)" : "(modified)"}</Text>
        </Box>
        <DiffViewer
          patches={[file.patch]}
          diffs={[diffLines]}
          scrollOffset={scrollOffset}
        />
        <Text color="gray">↑↓ scroll · esc or enter to go back</Text>
      </Box>
    );
  }

  // ── main chat view (idle + thinking + permission) ─────────────
  return (
    <Box flexDirection="column" gap={1}>
      <Static items={committed}>
        {(msg, i) => <StaticMessage key={i} msg={msg} />}
      </Static>

      {stage.type === "thinking" && (
        <Box gap={1}>
          <Text color={ORANGE}>
            <Spinner />
          </Text>
          <Text color="gray">{thinkingPhrase}</Text>
        </Box>
      )}

      {stage.type === "permission" && (
        <PermissionPrompt tool={stage.tool} onDecide={stage.resolve} />
      )}

      {stage.type === "idle" && (
        <>
          <Box gap={1} borderStyle="round" borderColor="gray" paddingX={1}>
            <Text color="cyan">&gt;</Text>
            <Text color="white">{inputValue}</Text>
            <Text color="gray">█</Text>
          </Box>
          <Text color="gray" dimColor>
            enter to send · ctrl+c to exit
          </Text>
        </>
      )}
    </Box>
  );
};
