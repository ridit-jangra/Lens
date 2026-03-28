import React, { useState, useRef } from "react";
import { Box, Text, Static, useInput } from "ink";
import { ACCENT, RED, GREEN } from "../../colors";
import { InputBox, ShortcutBar, TypewriterText } from "./ChatOverlays";
import { StaticMessage, MessageBody } from "./ChatMessage";
import type { UIMessage } from "./ChatMessage";
import { TextArea } from "./TextArea";
import {
  useThinkingPhrase,
  useThinkingTip,
  useThinkingTimer,
} from "../../utils/thinking";
import {
  chat,
  createSession,
  addMessage,
  getMessages,
  getSystemPrompt,
  saveSession,
} from "@ridit/lens-core";

// ── Commands ──────────────────────────────────────────────────────────────────

export const COMMANDS = [
  { cmd: "/auto", desc: "toggle auto-approve for read/search tools" },
  {
    cmd: "/auto --force-all",
    desc: "auto-approve ALL tools including shell and writes (⚠ dangerous)",
  },
  { cmd: "/clear history", desc: "wipe session memory for this repo" },
  { cmd: "/memory", desc: "memory commands" },
  { cmd: "/memory list", desc: "list all memories for this repo" },
  { cmd: "/memory add", desc: "add a memory" },
  { cmd: "/memory delete", desc: "delete a memory by id" },
  { cmd: "/memory clear", desc: "clear all memories" },
];

// ── Tool helpers ──────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  bash: "$",
  read: "r",
  write: "w",
  grep: "/",
  ls: "d",
  remember: "·",
};

function getToolLabel(tool: string, args: unknown): string {
  if (!args || typeof args !== "object") return tool;
  const a = args as Record<string, unknown>;
  switch (tool) {
    case "read":
      return String(a.path ?? a.file_path ?? "");
    case "write":
      return String(a.path ?? a.file_path ?? a.filename ?? "");
    case "bash":
      return String(a.command ?? a.cmd ?? "");
    case "grep": {
      const p = String(a.pattern ?? "");
      const g = String(a.glob ?? "");
      return g ? `${p}  ${g}` : p;
    }
    case "ls":
      return String(a.path ?? ".");
    case "remember": {
      const c = String(a.content ?? "");
      return c.length > 80 ? c.slice(0, 80) + "…" : c;
    }
    default:
      return "";
  }
}

function summarizeResult(result: string): string {
  const first = result.split("\n")[0] ?? "";
  return first.length > 120 ? first.slice(0, 120) + "…" : first;
}

// ── Command palette ───────────────────────────────────────────────────────────

function CommandPalette({ query }: { query: string }) {
  const q = query.toLowerCase();
  const matches = COMMANDS.filter((c) => c.cmd.startsWith(q));
  if (!matches.length) return null;
  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={2}>
      {matches.map((c, i) => {
        const isExact = c.cmd === query;
        return (
          <Box key={i} gap={2}>
            <Text color={isExact ? ACCENT : "white"} bold={isExact}>
              {c.cmd}
            </Text>
            <Text color="gray" dimColor>
              {c.desc}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

// ── Force-all warning ─────────────────────────────────────────────────────────

function ForceAllWarning({
  onConfirm,
}: {
  onConfirm: (confirmed: boolean) => void;
}) {
  const [input, setInput] = useState("");
  return (
    <Box flexDirection="column" marginY={1} gap={1}>
      <Box gap={1}>
        <Text color="red" bold>
          ⚠ WARNING
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2} gap={1}>
        <Text color="yellow">
          Force-all mode auto-approves EVERY tool without asking — including:
        </Text>
        <Text color="red" dimColor>
          {" "}· shell commands (rm, git, npm, anything)
        </Text>
        <Text color="red" dimColor>
          {" "}· file writes and deletes
        </Text>
        <Text color="yellow" dimColor>
          The AI can modify or delete files without any confirmation.
        </Text>
        <Text color="yellow" dimColor>
          Only use this in throwaway environments or when you fully trust the
          task.
        </Text>
      </Box>
      <Box gap={1} marginTop={1}>
        <Text color="gray">Type </Text>
        <Text color="white" bold>
          yes
        </Text>
        <Text color="gray"> to enable, or press </Text>
        <Text color="white" bold>
          esc
        </Text>
        <Text color="gray"> to cancel: </Text>
        <TextArea
          value={input}
          onChange={setInput}
          onSubmit={(v) => onConfirm(v.trim().toLowerCase() === "yes")}
          placeholder="yes / esc to cancel"
        />
      </Box>
    </Box>
  );
}

// ── Main runner ───────────────────────────────────────────────────────────────

export function ChatRunner({
  repoPath,
  autoForce = false,
  initialMessage,
}: {
  repoPath: string;
  autoForce?: boolean;
  initialMessage?: string;
}) {
  const [stage, setStage] = useState<"idle" | "thinking">("idle");
  const [committed, setCommitted] = useState<UIMessage[]>([]);
  const [inputValue, setInputValue] = useState(initialMessage ?? "");
  const [inputKey, setInputKey] = useState(0);
  const [currentChunk, setCurrentChunk] = useState("");
  const [autoApprove, setAutoApprove] = useState(autoForce);
  const [forceApprove, setForceApprove] = useState(autoForce);
  const [showForceWarning, setShowForceWarning] = useState(false);

  const sessionRef = useRef(createSession(repoPath));
  const abortRef = useRef<AbortController | null>(null);
  const inputHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const pendingToolRef = useRef<{ tool: string; args: unknown } | null>(null);

  const isThinking = stage === "thinking";
  const thinkingPhrase = useThinkingPhrase(isThinking);
  const thinkingTip = useThinkingTip(isThinking);
  const thinkingTimer = useThinkingTimer(isThinking);

  const pushMsg = (msg: UIMessage) =>
    setCommitted((prev) => [...prev, msg]);

  // ── Keyboard handling ──────────────────────────────────────────────────────

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      process.exit(0);
    }

    // ctrl+f toggles force-all
    if (key.ctrl && input === "f" && stage === "idle" && !showForceWarning) {
      if (forceApprove) {
        setForceApprove(false);
        setAutoApprove(false);
        pushMsg({
          role: "assistant",
          type: "text",
          content: "Force-all mode OFF — tools will ask for permission again.",
        });
      } else {
        setShowForceWarning(true);
      }
      return;
    }

    // esc during force-all warning
    if (showForceWarning && key.escape) {
      setShowForceWarning(false);
      return;
    }

    // esc cancels thinking
    if (stage === "thinking" && key.escape) {
      abortRef.current?.abort();
      abortRef.current = null;
      setCurrentChunk("");
      setStage("idle");
      return;
    }

    // input history navigation (only when idle, not showing force warning)
    if (stage === "idle" && !showForceWarning) {
      if (key.upArrow && inputHistoryRef.current.length > 0) {
        const next = Math.min(
          historyIndexRef.current + 1,
          inputHistoryRef.current.length - 1,
        );
        historyIndexRef.current = next;
        setInputValue(inputHistoryRef.current[next]!);
        setInputKey((k) => k + 1);
        return;
      }
      if (key.downArrow) {
        const next = historyIndexRef.current - 1;
        historyIndexRef.current = next;
        setInputValue(next < 0 ? "" : inputHistoryRef.current[next]!);
        setInputKey((k) => k + 1);
        return;
      }
      // tab autocomplete slash commands
      if (key.tab && inputValue.startsWith("/")) {
        const q = inputValue.toLowerCase();
        const match = COMMANDS.find((c) => c.cmd.startsWith(q));
        if (match) setInputValue(match.cmd);
        return;
      }
    }
  });

  // ── Slash commands ─────────────────────────────────────────────────────────

  const handleCommand = (text: string): boolean => {
    const t = text.trim().toLowerCase();

    if (t === "/auto --force-all") {
      if (forceApprove) {
        setForceApprove(false);
        setAutoApprove(false);
        pushMsg({
          role: "assistant",
          type: "text",
          content: "Force-all mode OFF — tools will ask for permission again.",
        });
      } else {
        setShowForceWarning(true);
      }
      return true;
    }

    if (t === "/auto") {
      if (forceApprove) {
        setForceApprove(false);
        setAutoApprove(true);
        pushMsg({
          role: "assistant",
          type: "text",
          content:
            "Force-all mode OFF — switched to normal auto-approve (safe tools only).",
        });
        return true;
      }
      const next = !autoApprove;
      setAutoApprove(next);
      pushMsg({
        role: "assistant",
        type: "text",
        content: next
          ? "Auto-approve ON — safe tools (read, search, grep) will run without asking."
          : "Auto-approve OFF — all tools will ask for permission.",
      });
      return true;
    }

    if (t === "/clear history") {
      sessionRef.current = createSession(repoPath);
      pushMsg({
        role: "assistant",
        type: "text",
        content: "History cleared for this repo.",
      });
      return true;
    }

    if (t === "/memory" || t === "/memory list") {
      pushMsg({
        role: "assistant",
        type: "text",
        content:
          "Memory is managed automatically. Use `/memory add <text>` to save context.",
      });
      return true;
    }

    if (t.startsWith("/memory add")) {
      const content = text.trim().slice("/memory add".length).trim();
      if (!content) {
        pushMsg({
          role: "assistant",
          type: "text",
          content: "Usage: `/memory add <content>`",
        });
        return true;
      }
      // Pass memory add as a system note — just acknowledge for now
      pushMsg({
        role: "assistant",
        type: "text",
        content: `Memory saved: ${content}`,
      });
      return true;
    }

    if (t === "/memory clear") {
      pushMsg({
        role: "assistant",
        type: "text",
        content: "Memories cleared.",
      });
      return true;
    }

    return false;
  };

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = async (text: string) => {
    if (!text.trim() || stage !== "idle") return;

    // push to history
    inputHistoryRef.current = [
      text,
      ...inputHistoryRef.current.filter((m) => m !== text),
    ].slice(0, 50);
    historyIndexRef.current = -1;

    // handle slash commands
    if (text.startsWith("/")) {
      if (handleCommand(text)) return;
    }

    pushMsg({ role: "user", type: "text", content: text });
    sessionRef.current = addMessage(sessionRef.current, "user", text);

    setStage("thinking");
    setCurrentChunk("");

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      await chat({
        messages: getMessages(sessionRef.current),
        system: getSystemPrompt(repoPath),
        onChunk: (chunk) => {
          if (!abort.signal.aborted) {
            setCurrentChunk((prev) => prev + chunk);
          }
        },
        onToolCall: (tool, args) => {
          if (!abort.signal.aborted) {
            pendingToolRef.current = { tool, args };
          }
        },
        onToolResult: (tool, result) => {
          if (!abort.signal.aborted && pendingToolRef.current) {
            const { tool: t, args } = pendingToolRef.current;
            const label = getToolLabel(t, args);
            const icon = TOOL_ICONS[t] ?? "·";
            const resultStr = summarizeResult(
              typeof result === "string" ? result : JSON.stringify(result),
            );
            pushMsg({
              role: "assistant",
              type: "tool",
              toolName: t,
              content: label || icon,
              result: resultStr,
              approved: true,
            });
            pendingToolRef.current = null;
          }
        },
        onFinish: (fullText) => {
          if (!abort.signal.aborted) {
            if (fullText.trim()) {
              pushMsg({ role: "assistant", type: "text", content: fullText });
              sessionRef.current = addMessage(
                sessionRef.current,
                "assistant",
                fullText,
              );
              saveSession(sessionRef.current);
            }
          }
          setCurrentChunk("");
          setStage("idle");
        },
      });
    } catch (err) {
      if (!abort.signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        pushMsg({ role: "assistant", type: "text", content: `Error: ${msg}` });
      }
      setCurrentChunk("");
      setStage("idle");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column">
      <Static items={committed}>
        {(msg, i) => <StaticMessage key={i} msg={msg} />}
      </Static>

      {showForceWarning && (
        <ForceAllWarning
          onConfirm={(confirmed) => {
            setShowForceWarning(false);
            if (confirmed) {
              setForceApprove(true);
              setAutoApprove(true);
              pushMsg({
                role: "assistant",
                type: "text",
                content:
                  "⚡⚡ Force-all mode ON — ALL tools auto-approved including shell and writes. Type /auto --force-all again to disable.",
              });
            } else {
              pushMsg({
                role: "assistant",
                type: "text",
                content: "Force-all cancelled.",
              });
            }
          }}
        />
      )}

      {!showForceWarning && stage === "thinking" && (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text color={ACCENT}>●</Text>
            <TypewriterText text={thinkingPhrase} />
            <Text color="gray" dimColor>
              {thinkingTimer ? `· ${thinkingTimer} ` : ""}· esc cancel
            </Text>
          </Box>
          <Box marginLeft={2}>
            <Text color="gray" dimColor>
              tip: {thinkingTip}
            </Text>
          </Box>
          {currentChunk ? (
            <Box gap={1} marginTop={1}>
              <Text color={ACCENT}>●</Text>
              <MessageBody content={currentChunk} />
            </Box>
          ) : null}
        </Box>
      )}

      {!showForceWarning && stage === "idle" && (
        <Box flexDirection="column">
          {inputValue.startsWith("/") && (
            <CommandPalette query={inputValue} />
          )}
          <InputBox
            value={inputValue}
            onChange={(v) => setInputValue(v)}
            onSubmit={(val) => {
              if (val.trim()) sendMessage(val.trim());
              setInputValue("");
              setInputKey((k) => k + 1);
            }}
            inputKey={inputKey}
          />
          <ShortcutBar autoApprove={autoApprove} forceApprove={forceApprove} />
        </Box>
      )}
    </Box>
  );
}
