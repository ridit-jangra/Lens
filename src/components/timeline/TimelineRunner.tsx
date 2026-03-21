import React, { useState, useEffect, useRef } from "react";
import { Box, Text, Static, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { execSync } from "child_process";
import { ProviderPicker } from "../provider/ProviderPicker";
import {
  fetchCommits,
  fetchDiff,
  isGitRepo,
  summarizeTimeline,
} from "../../utils/git";
import { callChat, parseResponse } from "../../utils/chat";
import { registry } from "../../utils/tools/registry";
import { buildGitToolsPromptSection } from "../../tools/git";
import type { Commit, DiffFile } from "../../utils/git";
import type { Provider } from "../../types/config";
import type { Message } from "../../types/chat";
import { TypewriterText, InputBox } from "../chat/ChatOverlays";
import { ACCENT } from "../../colors";

const W = () => process.stdout.columns ?? 100;

// ── git runner (only used by RevertConfirm) ───────────────────────────────────

function gitRun(cmd: string, cwd: string): { ok: boolean; out: string } {
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60_000,
    }).trim();
    return { ok: true, out: out || "(done)" };
  } catch (e: any) {
    const msg =
      [e.stdout, e.stderr].filter(Boolean).join("\n").trim() || e.message;
    return { ok: false, out: msg };
  }
}

// ── thinking phrases ──────────────────────────────────────────────────────────

const THINKING_PHRASES = [
  "thinking…",
  "reading the repo…",
  "consulting the log…",
  "grepping the history…",
  "diffing the vibes…",
  "sniffing the diff...",
  "reading your crimes...",
  "crafting the perfect commit message...",
  "pretending this was intentional all along...",
  "making it sound like a feature...",
  "turning chaos into conventional commits...",
  "72 chars or bust...",
  "git log will remember this...",
  "committing to the bit. and also the repo...",
  "staging your changes (and your career)...",
  "making main proud...",
  "git blame: not it...",
];

function randomPhrase() {
  return THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)]!;
}

// ── tiny helpers ──────────────────────────────────────────────────────────────

function shortDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  } catch {
    return d.slice(0, 10);
  }
}

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function bar(ins: number, del: number): string {
  const total = ins + del;
  if (!total) return "";
  const w = 10;
  const addW = Math.round((ins / total) * w);
  return "+" + "█".repeat(addW) + "░".repeat(w - addW) + "-";
}

// ── CommitRow ─────────────────────────────────────────────────────────────────

function CommitRow({
  commit,
  index,
  isSelected,
  showDiff,
  diff,
  diffScroll,
  onRevert,
}: {
  commit: Commit;
  index: number;
  isSelected: boolean;
  showDiff: boolean;
  diff: DiffFile[];
  diffScroll: number;
  onRevert: () => void;
}) {
  const w = W();
  const isMerge = commit.parents.length > 1;
  const node = isMerge ? "⎇" : index === 0 ? "◉" : "●";

  const refLabels = commit.refs
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) =>
      r.startsWith("HEAD -> ")
        ? r.slice(8)
        : r.startsWith("tag: ")
          ? `v${r.slice(5)}`
          : r,
    )
    .slice(0, 2);

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text color={isSelected ? ACCENT : "gray"}>
          {isSelected ? "▶" : " "}
        </Text>
        <Text color={isSelected ? ACCENT : isMerge ? "magenta" : "gray"}>
          {node}
        </Text>
        <Text color="gray" dimColor={!isSelected}>
          {commit.shortHash}
        </Text>
        <Text color="cyan" dimColor={!isSelected}>
          {shortDate(commit.date)}
        </Text>
        {refLabels.map((r) => (
          <Text key={r} color="yellow">
            [{r}]
          </Text>
        ))}
        <Text
          color={isSelected ? "white" : "gray"}
          bold={isSelected}
          wrap="truncate"
        >
          {trunc(commit.message, w - 36)}
        </Text>
      </Box>

      {isSelected && !showDiff && (
        <Box flexDirection="column" marginLeft={4} marginBottom={1}>
          <Box gap={2}>
            <Text color="gray" dimColor>
              {commit.author}
            </Text>
            <Text color="gray" dimColor>
              {commit.relativeDate}
            </Text>
            {commit.filesChanged > 0 && (
              <>
                <Text color="green">+{commit.insertions}</Text>
                <Text color="red">-{commit.deletions}</Text>
                <Text color="gray" dimColor>
                  {commit.filesChanged} file
                  {commit.filesChanged !== 1 ? "s" : ""}
                </Text>
                <Text color="gray" dimColor>
                  {bar(commit.insertions, commit.deletions)}
                </Text>
              </>
            )}
          </Box>
          {commit.body ? (
            <Text color="gray" dimColor wrap="wrap">
              {trunc(commit.body, w - 8)}
            </Text>
          ) : null}
          <Box gap={3} marginTop={1}>
            <Text color="gray" dimColor>
              enter diff
            </Text>
            <Text color="red" dimColor>
              x revert
            </Text>
          </Box>
        </Box>
      )}

      {isSelected && showDiff && (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
          <Box gap={3} marginBottom={1}>
            <Text color={ACCENT} bold>
              DIFF
            </Text>
            <Text color="gray" dimColor>
              {commit.shortHash} — {trunc(commit.message, 50)}
            </Text>
            <Text color="red" dimColor>
              x revert
            </Text>
            <Text color="gray" dimColor>
              esc close
            </Text>
          </Box>
          <DiffPanel
            files={diff}
            scrollOffset={diffScroll}
            maxLines={Math.max(8, (process.stdout.rows ?? 30) - 12)}
          />
          <Text color="gray" dimColor>
            ↑↓ scroll · esc close
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ── DiffPanel ─────────────────────────────────────────────────────────────────

function DiffPanel({
  files,
  scrollOffset,
  maxLines,
}: {
  files: DiffFile[];
  scrollOffset: number;
  maxLines: number;
}) {
  const w = W() - 6;

  type RLine =
    | {
        k: "file";
        path: string;
        ins: number;
        del: number;
        status: DiffFile["status"];
      }
    | { k: "hunk" | "add" | "rem" | "ctx"; content: string };

  const all: RLine[] = [];
  for (const f of files) {
    const icon =
      f.status === "added"
        ? "+"
        : f.status === "deleted"
          ? "-"
          : f.status === "renamed"
            ? "→"
            : "~";
    all.push({
      k: "file",
      path: `${icon} ${f.path}`,
      ins: f.insertions,
      del: f.deletions,
      status: f.status,
    });
    for (const l of f.lines) {
      if (l.type === "header") all.push({ k: "hunk", content: l.content });
      else if (l.type === "add") all.push({ k: "add", content: l.content });
      else if (l.type === "remove") all.push({ k: "rem", content: l.content });
      else all.push({ k: "ctx", content: l.content });
    }
  }

  if (!all.length)
    return (
      <Text color="gray" dimColor>
        {" "}
        no diff available
      </Text>
    );

  const visible = all.slice(scrollOffset, scrollOffset + maxLines);
  const hasMore = all.length > scrollOffset + maxLines;

  return (
    <Box flexDirection="column">
      {visible.map((line, i) => {
        if (line.k === "file") {
          const color =
            line.status === "added"
              ? "green"
              : line.status === "deleted"
                ? "red"
                : line.status === "renamed"
                  ? "yellow"
                  : "cyan";
          return (
            <Box key={i} gap={2} marginTop={i > 0 ? 1 : 0}>
              <Text color={color} bold>
                {trunc(line.path, w)}
              </Text>
              <Text color="green">+{line.ins}</Text>
              <Text color="red">-{line.del}</Text>
            </Box>
          );
        }
        if (line.k === "hunk")
          return (
            <Text key={i} color="cyan" dimColor>
              {trunc(line.content, w)}
            </Text>
          );
        if (line.k === "add")
          return (
            <Text key={i} color="green">
              {"+"}
              {trunc(line.content, w - 1)}
            </Text>
          );
        if (line.k === "rem")
          return (
            <Text key={i} color="red">
              {"-"}
              {trunc(line.content, w - 1)}
            </Text>
          );
        return (
          <Text key={i} color="gray" dimColor>
            {" "}
            {trunc(line.content, w - 1)}
          </Text>
        );
      })}
      {hasMore && (
        <Text color="gray" dimColor>
          {" "}
          … {all.length - scrollOffset - maxLines} more lines
        </Text>
      )}
    </Box>
  );
}

// ── RevertConfirm overlay ─────────────────────────────────────────────────────

function RevertConfirm({
  commit,
  repoPath,
  onDone,
}: {
  commit: Commit;
  repoPath: string;
  onDone: (msg: string | null) => void;
}) {
  const [status, setStatus] = useState<"confirm" | "running" | "done">(
    "confirm",
  );
  const [result, setResult] = useState("");

  useInput((input, key) => {
    if (status !== "confirm") return;
    if (input === "y" || input === "Y" || key.return) {
      setStatus("running");
      const r = gitRun(`git revert --no-edit "${commit.hash}"`, repoPath);
      setResult(r.out);
      setStatus("done");
      setTimeout(
        () => onDone(r.ok ? `Reverted ${commit.shortHash}` : null),
        1200,
      );
    }
    if (input === "n" || input === "N" || key.escape) onDone(null);
  });

  const w = W();
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" dimColor>
        {"─".repeat(w)}
      </Text>
      {status === "confirm" && (
        <Box flexDirection="column" paddingX={1} gap={1}>
          <Box gap={1}>
            <Text color="red">!</Text>
            <Text color="white">revert </Text>
            <Text color={ACCENT}>{commit.shortHash}</Text>
            <Text color="gray" dimColor>
              — {trunc(commit.message, 50)}
            </Text>
          </Box>
          <Text color="gray" dimColor>
            {" "}
            this creates a new "revert" commit — git history is preserved
          </Text>
          <Box gap={2} marginTop={1}>
            <Text color="green">y/enter confirm</Text>
            <Text color="gray" dimColor>
              n/esc cancel
            </Text>
          </Box>
        </Box>
      )}
      {status === "running" && (
        <Box paddingX={1} gap={1}>
          <Text color={ACCENT}>*</Text>
          <Text color="gray" dimColor>
            reverting…
          </Text>
        </Box>
      )}
      {status === "done" && (
        <Box paddingX={1} gap={1}>
          <Text
            color={
              result.startsWith("Error") || result.includes("error")
                ? "red"
                : "green"
            }
          >
            {result.startsWith("Error") ? "✗" : "✓"}
          </Text>
          <Text color="white" wrap="wrap">
            {trunc(result, W() - 6)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ── MsgBody ───────────────────────────────────────────────────────────────────
// Mirrors MessageBody from ChatMessage.tsx — inline code, bold, lists, code blocks.

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`"))
          return (
            <Text key={i} color={ACCENT}>
              {part.slice(1, -1)}
            </Text>
          );
        if (part.startsWith("**") && part.endsWith("**"))
          return (
            <Text key={i} bold color="white">
              {part.slice(2, -2)}
            </Text>
          );
        return (
          <Text key={i} color="white">
            {part}
          </Text>
        );
      })}
    </>
  );
}

function MsgBody({ content }: { content: string }) {
  const segments = content.split(/(```[\s\S]*?```)/g);
  return (
    <Box flexDirection="column">
      {segments.map((seg, si) => {
        if (seg.startsWith("```")) {
          const lines = seg.slice(3).split("\n");
          const code = lines
            .slice(1)
            .join("\n")
            .replace(/```\s*$/, "")
            .trimEnd();
          return (
            <Box key={si} flexDirection="column">
              {code.split("\n").map((line, li) => (
                <Text key={li} color={ACCENT}>
                  {"  "}
                  {line}
                </Text>
              ))}
            </Box>
          );
        }
        const lines = seg.split("\n").filter((l) => l.trim() !== "");
        return (
          <Box key={si} flexDirection="column">
            {lines.map((line, li) => {
              if (line.match(/^[-*•]\s/))
                return (
                  <Box key={li} gap={1}>
                    <Text color={ACCENT}>*</Text>
                    <InlineText text={line.slice(2).trim()} />
                  </Box>
                );
              if (line.match(/^\d+\.\s/)) {
                const num = line.match(/^(\d+)\.\s/)![1];
                return (
                  <Box key={li} gap={1}>
                    <Text color="gray">{num}.</Text>
                    <InlineText text={line.replace(/^\d+\.\s/, "").trim()} />
                  </Box>
                );
              }
              return (
                <Box key={li}>
                  <InlineText text={line} />
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

// ── AskPanel ──────────────────────────────────────────────────────────────────
//
// Uses the global registry + parseResponse — identical execution path to
// ChatRunner.processResponse. Git tools come from tools/git.ts which registers
// them into the registry at startup. No local tool definitions here.

type AskMsg =
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string }
  | { kind: "thinking" }
  | { kind: "image"; ansi: string }
  | {
      kind: "tool";
      toolName: string;
      label: string;
      result?: string;
      approved?: boolean;
    };

type PendingTool = {
  toolName: string;
  input: unknown;
  rawInput: string;
  remainder: string | undefined;
  history: Message[];
};

function AskPanel({
  commits,
  repoPath,
  provider,
  onReload,
}: {
  commits: Commit[];
  repoPath: string;
  provider: Provider;
  onReload: () => void;
}) {
  const [messages, setMessages] = useState<AskMsg[]>([]);
  const [apiHistory, setApiHistory] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [phrase, setPhrase] = useState(randomPhrase);
  const [pending, setPending] = useState<PendingTool | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { stdout } = useStdout();

  // Rotate thinking phrase while busy
  useEffect(() => {
    if (!thinking) return;
    setPhrase(randomPhrase());
    const id = setInterval(() => setPhrase(randomPhrase()), 3200);
    return () => clearInterval(id);
  }, [thinking]);

  const systemPrompt = `You are a git assistant embedded in a terminal timeline viewer.
Repository: ${repoPath}

You have access to git tools to answer questions and perform git operations.
${buildGitToolsPromptSection()}

Rules:
- Use read tools freely to answer questions requiring live data
- For write operations briefly explain what you are about to do before emitting the tag
- After a tool result is returned, continue your response naturally
- Plain text only — no markdown headers
- Be concise

Timeline summary (last 300 commits):
${summarizeTimeline(commits)}`;

  // ── core process loop — mirrors ChatRunner.processResponse ─────────────────

  const processResponse = (
    raw: string,
    currentHistory: Message[],
    signal: AbortSignal,
  ) => {
    if (signal.aborted) {
      setThinking(false);
      return;
    }

    const parsed = parseResponse(raw);

    // plain text
    if (parsed.kind === "text") {
      const clean = parsed.content.replace(/\*\*([^*]+)\*\*/g, "$1").trim();
      setMessages((prev) => [
        ...prev.filter((m) => m.kind !== "thinking"),
        { kind: "assistant", content: clean },
      ]);
      setApiHistory([
        ...currentHistory,
        { role: "assistant", content: clean, type: "text" },
      ]);
      setThinking(false);
      return;
    }

    // tool call
    if (parsed.kind === "tool") {
      const tool = registry.get(parsed.toolName);
      if (!tool) {
        setThinking(false);
        return;
      }

      const label = tool.summariseInput
        ? String(tool.summariseInput(parsed.input))
        : parsed.rawInput;

      if (tool.safe) {
        // Auto-approve — keep thinking true the whole time so input stays locked.
        // Replace the thinking bubble with preamble (if any) + tool row + new thinking bubble.
        setMessages((prev) => [
          ...prev.filter((m) => m.kind !== "thinking"),
          ...(parsed.content
            ? [{ kind: "assistant" as const, content: parsed.content }]
            : []),
          {
            kind: "tool" as const,
            toolName: parsed.toolName,
            label,
            approved: true,
          },
          { kind: "thinking" as const },
        ]);
        executeAndContinue(
          {
            toolName: parsed.toolName,
            input: parsed.input,
            rawInput: parsed.rawInput,
            remainder: parsed.remainder,
            history: currentHistory,
          },
          true,
          signal,
        );
      } else {
        // Write tool — stop thinking, show permission prompt, block input via pending.
        setThinking(false);
        setMessages((prev) => [
          ...prev.filter((m) => m.kind !== "thinking"),
          ...(parsed.content
            ? [{ kind: "assistant" as const, content: parsed.content }]
            : []),
          { kind: "tool" as const, toolName: parsed.toolName, label },
        ]);
        setPending({
          toolName: parsed.toolName,
          input: parsed.input,
          rawInput: parsed.rawInput,
          remainder: parsed.remainder,
          history: currentHistory,
        });
      }
      return;
    }

    // anything else (changes, clone) — show as text in this context
    setMessages((prev) => [
      ...prev.filter((m) => m.kind !== "thinking"),
      { kind: "assistant", content: raw.trim() },
    ]);
    setThinking(false);
  };

  const executeAndContinue = async (
    p: PendingTool,
    approved: boolean,
    signal: AbortSignal,
  ) => {
    const tool = registry.get(p.toolName);
    if (!tool) return;

    let result = "(denied by user)";
    let resultKind: string = "text";

    if (approved) {
      try {
        const toolResult = await tool.execute(p.input, {
          repoPath,
          messages: p.history,
        });
        result = toolResult.value;
        resultKind = (toolResult as any).kind ?? "text";
      } catch (e: any) {
        result = `Error: ${e.message}`;
      }
    }

    // Image result — write ANSI directly to stdout (bypasses Ink's renderer)
    // and inject an image message into the list instead of a text result.
    if (resultKind === "image" && approved) {
      setMessages((prev) => {
        const next = prev
          .map((m) =>
            m.kind === "tool" &&
            m.toolName === p.toolName &&
            m.result === undefined
              ? { ...m, result: "(image)", approved }
              : m,
          )
          .filter((m) => m.kind !== "thinking");
        return [...next, { kind: "image" as const, ansi: result }];
      });
      stdout.write(result + "\n");
    } else {
      // Stamp result onto the tool bubble and remove the trailing thinking bubble
      // in one atomic update — no intermediate render with a dangling spinner.
      setMessages((prev) => {
        const next = prev
          .map((m) =>
            m.kind === "tool" &&
            m.toolName === p.toolName &&
            m.result === undefined
              ? { ...m, result, approved }
              : m,
          )
          .filter((m) => m.kind !== "thinking");
        return next;
      });
    }

    // reload commit list if a write succeeded
    if (
      approved &&
      !result.startsWith("Error") &&
      !result.startsWith("(denied")
    ) {
      onReload();
    }

    const nextHistory: Message[] = [
      ...p.history,
      {
        role: "user" as const,
        content: approved
          ? `Tool result for <${p.toolName}>:\n${result}`
          : `Tool <${p.toolName}> was denied by the user.`,
        type: "text" as const,
      },
    ];
    setApiHistory(nextHistory);

    // if the model already wrote a remainder, process it inline
    if (approved && p.remainder) {
      processResponse(p.remainder, nextHistory, signal);
      return;
    }

    // no remainder — follow-up API call.
    // Set thinking BEFORE the stamp so isBusy never drops to false between
    // the tool completing and the next runChat starting.
    setThinking(true);
    setMessages((prev) => [...prev, { kind: "thinking" }]);
    runChat(nextHistory, signal);
  };

  const runChat = async (history: Message[], signal: AbortSignal) => {
    try {
      const raw = await callChat(provider, systemPrompt, history, signal);
      if (signal.aborted) return;
      processResponse(raw, history, signal);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setMessages((prev) => [
        ...prev.filter((m) => m.kind !== "thinking"),
        { kind: "assistant", content: `Error: ${String(e)}` },
      ]);
      setThinking(false);
    }
  };

  const ask = async (q: string) => {
    if (!q.trim() || thinking || pending !== null) return;

    const userMsg: Message = { role: "user", content: q, type: "text" };
    const nextHistory = [...apiHistory, userMsg];

    // Set thinking true FIRST so isBusy blocks input before the next render
    setThinking(true);
    setMessages((prev) => [
      ...prev,
      { kind: "user", content: q },
      { kind: "thinking" },
    ]);
    setApiHistory(nextHistory);
    setInput("");

    const abort = new AbortController();
    abortRef.current = abort;
    await runChat(nextHistory, abort.signal);
  };

  // permission y/n — only fires when pending !== null
  useInput((inp, key) => {
    if (!pending) return;
    if (inp === "y" || inp === "Y" || key.return) {
      const p = pending;
      setPending(null);
      const abort = abortRef.current ?? new AbortController();
      executeAndContinue(p, true, abort.signal);
    } else if (inp === "n" || inp === "N" || key.escape) {
      const p = pending;
      setPending(null);
      const abort = abortRef.current ?? new AbortController();
      executeAndContinue(p, false, abort.signal);
    }
  });

  const w = W();
  const isBusy = thinking || pending !== null;
  const hasThinking = messages.some((m) => m.kind === "thinking");

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" dimColor>
        {"─".repeat(w)}
      </Text>

      <Box paddingX={1} marginBottom={1} gap={2}>
        <Text color={ACCENT} bold>
          ASK
        </Text>
        <Text color="gray" dimColor>
          git tools available · y/n for writes · esc back
        </Text>
      </Box>

      {messages.map((msg, i) => {
        // ── thinking ────────────────────────────────────────────────────
        if (msg.kind === "thinking") {
          // Only render the last thinking bubble; use phrase state directly
          const lastIdx = messages.map((m) => m.kind).lastIndexOf("thinking");
          if (i !== lastIdx) return null;
          return (
            <Box key="thinking" gap={1} marginBottom={1}>
              <Text color={ACCENT}>●</Text>
              <TypewriterText key={phrase} text={phrase} />
            </Box>
          );
        }

        // ── user ────────────────────────────────────────────────────────
        if (msg.kind === "user") {
          return (
            <Box
              key={i}
              marginBottom={1}
              gap={1}
              backgroundColor="#1a1a1a"
              paddingLeft={1}
              paddingRight={2}
            >
              <Text color="gray">{">"}</Text>
              <Text color="white" bold>
                {msg.content}
              </Text>
            </Box>
          );
        }

        // ── tool ────────────────────────────────────────────────────────
        if (msg.kind === "tool") {
          const isDone = msg.result !== undefined;
          const denied = msg.approved === false;
          const isError = msg.result?.startsWith("Error") || denied;
          const tool = registry.get(msg.toolName);
          const isWrite = tool && !tool.safe;
          return (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Box gap={1}>
                <Text color={denied ? "red" : ACCENT}>$</Text>
                <Text color={denied ? "red" : "gray"} dimColor={!denied}>
                  {trunc(msg.label, w - 4)}
                </Text>
                {denied && <Text color="red">denied</Text>}
              </Box>
              {!isDone && isWrite && (
                <Box marginLeft={2} gap={1}>
                  <Text color="gray">y/enter allow · n/esc deny</Text>
                </Box>
              )}
              {isDone && msg.result && (
                <Box marginLeft={2}>
                  <Text color={isError ? "red" : "gray"} dimColor={!isError}>
                    {trunc(msg.result.split("\n")[0]!, w - 6)}
                    {(msg.result.split("\n")[0]?.length ?? 0) > w - 6
                      ? "…"
                      : ""}
                  </Text>
                </Box>
              )}
            </Box>
          );
        }

        // ── image ────────────────────────────────────────────────────────
        // Already written to stdout raw — just show a placeholder label so
        // the message list stays coherent and the image appears above it.
        if (msg.kind === "image") {
          return (
            <Box key={i} gap={1} marginBottom={1}>
              <Text color={ACCENT}>◎</Text>
              <Text color="gray" dimColor>
                image rendered above
              </Text>
            </Box>
          );
        }

        // ── assistant ───────────────────────────────────────────────────
        return (
          <Box key={i} marginBottom={1} gap={1}>
            <Text color={ACCENT}>●</Text>
            <MsgBody content={msg.content} />
          </Box>
        );
      })}

      {pending && (
        <Box marginLeft={2} gap={1} marginBottom={1}>
          <Text color="gray">y/enter allow · n/esc deny</Text>
        </Box>
      )}

      <InputBox
        value={input}
        onChange={setInput}
        onSubmit={(v) => {
          if (v.trim()) ask(v.trim());
        }}
        inputKey={isBusy ? 1 : 0}
      />
    </Box>
  );
}

// ── TimelineRunner ────────────────────────────────────────────────────────────

type UIMode =
  | { type: "browse" }
  | { type: "search"; query: string }
  | { type: "ask" }
  | { type: "revert"; commit: Commit };

type StatusMsg = { id: number; text: string; ok: boolean };
let sid = 0;

export function TimelineRunner({
  repoPath,
  onExit,
}: {
  repoPath: string;
  onExit?: () => void;
}) {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [filtered, setFiltered] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showDiff, setShowDiff] = useState(false);
  const [diff, setDiff] = useState<DiffFile[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffScroll, setDiffScroll] = useState(0);
  const [lastDiffHash, setLastDiffHash] = useState<string | null>(null);

  const [mode, setMode] = useState<UIMode>({ type: "browse" });
  const [statusMsgs, setStatusMsgs] = useState<StatusMsg[]>([]);

  const termHeight = process.stdout.rows ?? 30;
  const visibleCount = Math.max(4, termHeight - 6);

  const addStatus = (text: string, ok: boolean) =>
    setStatusMsgs((prev) => [...prev, { id: ++sid, text, ok }]);

  const reloadCommits = () => {
    const loaded = fetchCommits(repoPath, 300);
    setCommits(loaded);
    setFiltered(loaded);
    setSelectedIdx(0);
    setScrollOffset(0);
    setShowDiff(false);
  };

  useEffect(() => {
    if (!isGitRepo(repoPath)) {
      setError("Not a git repository.");
      setLoading(false);
      return;
    }
    const loaded = fetchCommits(repoPath, 300);
    if (!loaded.length) {
      setError("No commits found.");
      setLoading(false);
      return;
    }
    setCommits(loaded);
    setFiltered(loaded);
    setLoading(false);
  }, [repoPath]);

  useEffect(() => {
    if (mode.type !== "search" || !mode.query) {
      setFiltered(commits);
    } else {
      const q = mode.query.toLowerCase();
      setFiltered(
        commits.filter(
          (c) =>
            c.message.toLowerCase().includes(q) ||
            c.author.toLowerCase().includes(q) ||
            c.shortHash.includes(q),
        ),
      );
    }
    setSelectedIdx(0);
    setScrollOffset(0);
  }, [mode, commits]);

  const selected = filtered[selectedIdx] ?? null;

  useEffect(() => {
    if (!selected || selected.hash === lastDiffHash) return;
    setDiff([]);
    setDiffScroll(0);
    setLastDiffHash(selected.hash);
    if (showDiff) {
      setDiffLoading(true);
      setTimeout(() => {
        setDiff(fetchDiff(repoPath, selected.hash));
        setDiffLoading(false);
      }, 0);
    }
  }, [selected?.hash]);

  useEffect(() => {
    if (!showDiff || !selected) return;
    if (selected.hash === lastDiffHash && diff.length) return;
    setDiffLoading(true);
    setLastDiffHash(selected.hash);
    setTimeout(() => {
      setDiff(fetchDiff(repoPath, selected.hash));
      setDiffLoading(false);
    }, 0);
  }, [showDiff]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (onExit) onExit();
      else process.exit(0);
    }

    if (mode.type === "ask" || mode.type === "revert") {
      if (key.escape) setMode({ type: "browse" });
      return;
    }

    if (mode.type === "search") {
      if (key.escape) setMode({ type: "browse" });
      return;
    }

    if (showDiff) {
      if (key.escape || input === "d") {
        setShowDiff(false);
        return;
      }
      if (key.upArrow) {
        setDiffScroll((o) => Math.max(0, o - 1));
        return;
      }
      if (key.downArrow) {
        setDiffScroll((o) => o + 1);
        return;
      }
      if (input === "x" || input === "X") {
        if (selected) setMode({ type: "revert", commit: selected });
        return;
      }
      return;
    }

    if (key.escape) {
      setShowDiff(false);
      return;
    }
    if ((input === "q" || input === "Q") && onExit) {
      onExit();
      return;
    }
    if (input === "/") {
      setMode({ type: "search", query: "" });
      return;
    }
    if (input === "?" || input === "a" || input === "A") {
      setMode({ type: "ask" });
      return;
    }
    if (key.return && selected) {
      setShowDiff(true);
      return;
    }
    if (input === "x" || input === "X") {
      if (selected) setMode({ type: "revert", commit: selected });
      return;
    }
    if (key.upArrow) {
      const next = Math.max(0, selectedIdx - 1);
      setSelectedIdx(next);
      setShowDiff(false);
      if (next < scrollOffset) setScrollOffset(next);
      return;
    }
    if (key.downArrow) {
      const next = Math.min(filtered.length - 1, selectedIdx + 1);
      setSelectedIdx(next);
      setShowDiff(false);
      if (next >= scrollOffset + visibleCount)
        setScrollOffset(next - visibleCount + 1);
      return;
    }
  });

  if (!provider) return <ProviderPicker onDone={setProvider} />;
  if (loading)
    return (
      <Box gap={1} marginTop={1}>
        <Text color={ACCENT}>*</Text>
        <Text color="gray">loading commits…</Text>
      </Box>
    );
  if (error)
    return (
      <Box gap={1} marginTop={1}>
        <Text color="red">✗</Text>
        <Text color="white">{error}</Text>
      </Box>
    );

  const w = W();
  const isSearching = mode.type === "search";
  const isAsking = mode.type === "ask";
  const isReverting = mode.type === "revert";
  const searchQuery = isSearching ? mode.query : "";
  const visible = filtered.slice(scrollOffset, scrollOffset + visibleCount);

  const shortcutHint = showDiff
    ? "↑↓ scroll · x revert · esc/d close"
    : isSearching
      ? "type to filter · enter confirm · esc cancel"
      : isAsking
        ? "ask anything · git tools available · esc back"
        : isReverting
          ? "y confirm · n/esc cancel"
          : `↑↓ navigate · enter diff · x revert · a ask · / search${onExit ? " · q back" : " · ^C exit"}`;

  return (
    <Box flexDirection="column">
      {/* header */}
      <Box gap={2} marginBottom={1}>
        <Text color={ACCENT} bold>
          ◈ TIMELINE
        </Text>
        <Text color="gray" dimColor>
          {repoPath}
        </Text>
        {isSearching && <Text color="yellow">/ {searchQuery || "…"}</Text>}
        {isSearching && filtered.length !== commits.length && (
          <Text color="gray" dimColor>
            {filtered.length} matches
          </Text>
        )}
      </Box>

      {/* status messages */}
      <Static items={statusMsgs}>
        {(msg) => (
          <Box key={msg.id} paddingX={1} gap={1}>
            <Text color={msg.ok ? "green" : "red"}>{msg.ok ? "✓" : "✗"}</Text>
            <Text color={msg.ok ? "white" : "red"}>{msg.text}</Text>
          </Box>
        )}
      </Static>

      {/* search bar */}
      {isSearching && (
        <Box gap={1} marginBottom={1}>
          <Text color={ACCENT}>{"/"}</Text>
          <TextInput
            value={searchQuery}
            onChange={(q) => setMode({ type: "search", query: q })}
            onSubmit={() => setMode({ type: "browse" })}
            placeholder="filter commits…"
          />
        </Box>
      )}

      {/* commit list */}
      {visible.map((commit, i) => {
        const absIdx = scrollOffset + i;
        const isSel = absIdx === selectedIdx;
        return (
          <CommitRow
            key={commit.hash}
            commit={commit}
            index={absIdx}
            isSelected={isSel}
            showDiff={isSel && showDiff}
            diff={isSel ? diff : []}
            diffScroll={diffScroll}
            onRevert={() => setMode({ type: "revert", commit })}
          />
        );
      })}

      {(scrollOffset > 0 || scrollOffset + visibleCount < filtered.length) && (
        <Box gap={3} marginTop={1}>
          {scrollOffset > 0 && (
            <Text color="gray" dimColor>
              ↑ {scrollOffset} above
            </Text>
          )}
          {scrollOffset + visibleCount < filtered.length && (
            <Text color="gray" dimColor>
              ↓ {filtered.length - scrollOffset - visibleCount} below
            </Text>
          )}
        </Box>
      )}

      {/* revert overlay */}
      {isReverting && mode.type === "revert" && (
        <RevertConfirm
          commit={mode.commit}
          repoPath={repoPath}
          onDone={(msg) => {
            setMode({ type: "browse" });
            if (msg) {
              addStatus(msg, true);
              reloadCommits();
            } else {
              addStatus("revert cancelled", false);
            }
          }}
        />
      )}

      {/* ask panel */}
      {isAsking && provider && (
        <AskPanel
          commits={commits}
          repoPath={repoPath}
          provider={provider}
          onReload={() => {
            reloadCommits();
            addStatus("commits reloaded", true);
          }}
        />
      )}

      {/* shortcut bar */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {shortcutHint}
        </Text>
      </Box>
    </Box>
  );
}
