import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import { chat, getSystemPrompt } from "@ridit/lens-core";
import { spawnWatch, readPackageJson } from "../../utils/watch";
import type { ErrorChunk, WatchProcess } from "../../utils/watch";
import { ACCENT, GREEN, RED } from "../../colors";

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = "running" | "crashed";

type ToolEntry = { tool: string; label: string };

type Investigation = {
  id: string;
  chunk: ErrorChunk;
  status: "thinking" | "done" | "failed";
  toolLog: ToolEntry[];
  response: string;
  startTime: number;
};

type PendingError = { id: string; chunk: ErrorChunk };

// ── Helpers ───────────────────────────────────────────────────────────────────

let _idCounter = 0;
const nextId = () => (++_idCounter).toString(36);

function stripAnsi(s: string) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

const TOOL_ICONS: Record<string, string> = {
  bash: "$", read: "r", write: "w", grep: "/", ls: "d", remember: "·",
};

function toolLabel(tool: string, args: unknown): string {
  if (!args || typeof args !== "object") return tool;
  const a = args as Record<string, unknown>;
  switch (tool) {
    case "read": return String(a.path ?? a.file_path ?? "");
    case "write": return String(a.path ?? a.file_path ?? "");
    case "bash": return String(a.command ?? "").slice(0, 60);
    case "grep": return String(a.pattern ?? "");
    case "ls": return String(a.path ?? ".");
    default: return "";
  }
}

function buildWatchSystemPrompt(repoPath: string, cmd: string, deps: string): string {
  const base = getSystemPrompt(repoPath);
  return `${base}

## Watch Mode
You are monitoring a running dev process: \`${cmd}\`
${deps ? `Project dependencies: ${deps}` : ""}

When given an error:
1. Use read, grep, and ls tools to investigate — find the actual cause
2. If you can fix it, use the write tool to apply the fix directly
3. After investigating, respond with a short summary: what the error was, what caused it, what you did to fix it (or how to fix it manually)

Work autonomously. Don't ask for permission — investigate and fix, then summarize.`;
}

function buildErrorMessage(chunk: ErrorChunk): string {
  const lines = chunk.lines.join("\n").slice(0, 2000);
  const ctx = chunk.contextBefore.length > 0
    ? `\nContext before error:\n\`\`\`\n${chunk.contextBefore.join("\n")}\n\`\`\``
    : "";
  const loc = chunk.filePath
    ? `\nError location: ${chunk.filePath}${chunk.lineNumber ? `:${chunk.lineNumber}` : ""}`
    : "";
  return `Error detected in dev process:\n\`\`\`\n${lines}\n\`\`\`${ctx}${loc}\n\nInvestigate and fix this.`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LogPane({ logs }: { logs: { text: string; isErr: boolean }[] }) {
  const rows = process.stdout.rows ?? 24;
  const visible = logs.slice(-Math.max(4, rows - 14));
  return (
    <Box flexDirection="column" marginBottom={1}>
      {visible.map((l, i) => (
        <Text key={i} color={l.isErr ? RED : "gray"} dimColor={!l.isErr}>
          {l.text.slice(0, 200)}
        </Text>
      ))}
    </Box>
  );
}

function ConfirmCard({ chunk }: { chunk: ErrorChunk }) {
  const cols = process.stdout.columns ?? 80;
  const rule = "─".repeat(Math.min(cols - 2, 72));
  const preview = chunk.lines[0]?.slice(0, 70) ?? "error detected";
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="gray" dimColor>{rule}</Text>
      <Box gap={1}>
        <Text color={RED}>✖</Text>
        <Text color="white">{preview}</Text>
      </Box>
      {chunk.filePath && (
        <Box marginLeft={2} gap={1}>
          <Text color="gray" dimColor>›</Text>
          <Text color="gray" dimColor>
            {chunk.filePath}{chunk.lineNumber ? `:${chunk.lineNumber}` : ""}
          </Text>
        </Box>
      )}
      <Box marginLeft={2} marginTop={1} gap={1}>
        <Text color={GREEN}>y</Text><Text color="gray" dimColor> investigate  ·  </Text>
        <Text color="gray">n</Text><Text color="gray" dimColor> skip</Text>
      </Box>
    </Box>
  );
}

function ThinkingCard({ inv }: { inv: Investigation }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - inv.startTime) / 1000)), 1000);
    return () => clearInterval(t);
  }, [inv.startTime]);

  const preview = inv.chunk.lines[0]?.slice(0, 60) ?? "";
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text color={ACCENT}><Spinner /></Text>
        <Text color="gray" dimColor>{preview}</Text>
        <Text color="gray" dimColor>{elapsed}s</Text>
      </Box>
      {inv.toolLog.slice(-4).map((t, i) => (
        <Box key={i} marginLeft={2} gap={1}>
          <Text color={ACCENT} dimColor>{TOOL_ICONS[t.tool] ?? "·"}</Text>
          <Text color="gray" dimColor>{t.label}</Text>
        </Box>
      ))}
    </Box>
  );
}

function ResultCard({ inv }: { inv: Investigation }) {
  const cols = process.stdout.columns ?? 80;
  const rule = "─".repeat(Math.min(cols - 2, 72));
  const errorLine = inv.chunk.lines[0]?.slice(0, 70) ?? "error";
  const wroteFiles = inv.toolLog.filter((t) => t.tool === "write");

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="gray" dimColor>{rule}</Text>
      <Box gap={1}>
        <Text color={inv.status === "failed" ? RED : GREEN}>
          {inv.status === "failed" ? "✖" : "✔"}
        </Text>
        <Text color="white" bold>{errorLine}</Text>
      </Box>
      {wroteFiles.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginTop={0}>
          {wroteFiles.map((t, i) => (
            <Box key={i} gap={1}>
              <Text color={ACCENT}>w</Text>
              <Text color="gray">{t.label}</Text>
            </Box>
          ))}
        </Box>
      )}
      {inv.response.trim() && (
        <Box marginLeft={2} marginTop={1}>
          <Text color="gray">{inv.response.trim().slice(0, 300)}</Text>
        </Box>
      )}
    </Box>
  );
}

function InputCard({ prompt, value }: { prompt: string; value: string }) {
  return (
    <Box flexDirection="column" marginBottom={1} gap={1}>
      <Box gap={1}>
        <Text color={ACCENT}>?</Text>
        <Text color="white">{prompt}</Text>
      </Box>
      <Box marginLeft={2} gap={1}>
        <Text color={ACCENT}>›</Text>
        <Text color="white">{value}</Text>
        <Text color={ACCENT}>▋</Text>
      </Box>
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const MAX_LOGS = 120;

export function RunView({
  cmd,
  repoPath,
  fixAll = false,
  autoRestart = false,
}: {
  cmd: string;
  repoPath: string;
  fixAll?: boolean;
  autoRestart?: boolean;
}) {
  const [stage, setStage] = useState<Stage>("running");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [logs, setLogs] = useState<{ text: string; isErr: boolean }[]>([]);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [pending, setPending] = useState<PendingError[]>([]);
  const [inputRequest, setInputRequest] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");

  const processRef = useRef<WatchProcess | null>(null);
  const activeCountRef = useRef(0);
  const pendingExitRef = useRef<number | null | undefined>(undefined);
  const abortRefs = useRef<Map<string, AbortController>>(new Map());
  const systemPromptRef = useRef("");

  const currentPending = pending[0] ?? null;

  const updateInv = (id: string, patch: Partial<Investigation>) =>
    setInvestigations((prev) =>
      prev.map((inv) => (inv.id === id ? { ...inv, ...patch } : inv)),
    );

  // ── Investigation ──────────────────────────────────────────────────────────

  const investigate = async (id: string, chunk: ErrorChunk) => {
    const abort = new AbortController();
    abortRefs.current.set(id, abort);

    const inv: Investigation = {
      id,
      chunk,
      status: "thinking",
      toolLog: [],
      response: "",
      startTime: Date.now(),
    };
    setInvestigations((prev) => [...prev.slice(-6), inv]);

    const finish = (status: "done" | "failed") => {
      updateInv(id, { status });
      activeCountRef.current -= 1;
      if (activeCountRef.current === 0 && pendingExitRef.current !== undefined) {
        setStage("crashed");
        setExitCode(pendingExitRef.current);
      }
    };

    try {
      await chat({
        messages: [{ role: "user", content: buildErrorMessage(chunk) }],
        system: systemPromptRef.current,
        onBeforeToolCall: () => Promise.resolve(true),
        onToolCall: (tool, args) => {
          const label = toolLabel(tool, args);
          updateInv(id, {
            toolLog: [...(investigations.find((i) => i.id === id)?.toolLog ?? []),
              { tool, label }],
          });
          // append to log live
          setInvestigations((prev) =>
            prev.map((inv) =>
              inv.id === id
                ? { ...inv, toolLog: [...inv.toolLog, { tool, label }] }
                : inv,
            ),
          );
        },
        onToolResult: () => {},
        onChunk: () => {},
        onFinish: (text) => {
          setInvestigations((prev) =>
            prev.map((inv) =>
              inv.id === id ? { ...inv, response: text, status: "done" } : inv,
            ),
          );
          activeCountRef.current -= 1;
          if (activeCountRef.current === 0 && pendingExitRef.current !== undefined) {
            setStage("crashed");
            setExitCode(pendingExitRef.current);
          }
        },
      });
    } catch (e: unknown) {
      if (abort.signal.aborted) return;
      const msg = e instanceof Error ? e.message : String(e);
      setInvestigations((prev) =>
        prev.map((inv) =>
          inv.id === id
            ? { ...inv, response: `Investigation failed: ${msg}`, status: "failed" }
            : inv,
        ),
      );
      finish("failed");
    }
  };

  // ── Process lifecycle ──────────────────────────────────────────────────────

  const startWatching = () => {
    const deps = readPackageJson(repoPath);
    systemPromptRef.current = buildWatchSystemPrompt(repoPath, cmd, deps);

    const proc = spawnWatch(cmd, repoPath);
    processRef.current = proc;

    proc.onLog((line, isErr) => {
      const text = stripAnsi(line).slice(0, 200);
      setLogs((prev) => {
        const next = [...prev, { text, isErr }];
        return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
      });
    });

    proc.onError((chunk) => {
      const id = nextId();
      activeCountRef.current += 1;
      if (fixAll) {
        investigate(id, chunk);
      } else {
        setPending((prev) => [...prev, { id, chunk }]);
      }
    });

    proc.onInputRequest((prompt) => {
      setInputRequest(prompt);
      setInputValue("");
    });

    proc.onExit((code) => {
      pendingExitRef.current = code;
      if (activeCountRef.current === 0) {
        setStage("crashed");
        setExitCode(code);
      }
    });
  };

  const handleRestart = () => {
    pendingExitRef.current = undefined;
    activeCountRef.current = 0;
    abortRefs.current.forEach((a) => a.abort());
    abortRefs.current.clear();
    processRef.current?.kill();
    setInvestigations([]);
    setLogs([]);
    setPending([]);
    setStage("running");
    setExitCode(null);
    startWatching();
  };

  useEffect(() => {
    startWatching();
    return () => {
      processRef.current?.kill();
      abortRefs.current.forEach((a) => a.abort());
    };
  }, []);

  useEffect(() => {
    if (autoRestart && stage === "crashed") {
      const t = setTimeout(handleRestart, 1500);
      return () => clearTimeout(t);
    }
  }, [stage]);

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      processRef.current?.kill();
      process.exit(0);
    }

    if (inputRequest !== null) {
      if (key.return) {
        processRef.current?.sendInput(inputValue);
        setInputRequest(null);
        setInputValue("");
      } else if (key.backspace || key.delete) {
        setInputValue((v) => v.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setInputValue((v) => v + input);
      }
      return;
    }

    if (stage === "crashed" && (input === "r" || input === "R")) {
      handleRestart();
      return;
    }

    if (currentPending) {
      if (input === "y" || input === "Y") {
        const { id, chunk } = currentPending;
        setPending((prev) => prev.filter((p) => p.id !== id));
        investigate(id, chunk);
      } else if (input === "n" || input === "N") {
        activeCountRef.current -= 1;
        setPending((prev) => prev.slice(1));
        if (activeCountRef.current === 0 && pendingExitRef.current !== undefined) {
          setStage("crashed");
          setExitCode(pendingExitRef.current);
        }
      }
    }
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  const cols = process.stdout.columns ?? 80;
  const thinking = investigations.filter((i) => i.status === "thinking");
  const done = investigations.filter((i) => i.status !== "thinking");

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={2}>
          <Text color={ACCENT} bold>◆ lens run</Text>
          <Text color="gray" dimColor>·</Text>
          <Text color="white" dimColor>{cmd}</Text>
          {fixAll && <><Text color="gray" dimColor>·</Text><Text color={GREEN}>fix-all</Text></>}
          {autoRestart && <><Text color="gray" dimColor>·</Text><Text color="gray">auto-restart</Text></>}
        </Box>
        <Text color="gray" dimColor>{"─".repeat(Math.min(cols, 80))}</Text>
      </Box>

      {/* Process logs */}
      {logs.length > 0 && <LogPane logs={logs} />}
      {stage === "running" && logs.length === 0 && (
        <Box gap={1} marginBottom={1}>
          <Text color={ACCENT}><Spinner /></Text>
          <Text color="gray" dimColor>waiting for output…</Text>
        </Box>
      )}

      {/* Process input request */}
      {inputRequest !== null && <InputCard prompt={inputRequest} value={inputValue} />}

      {/* Completed investigations */}
      {done.map((inv) => <ResultCard key={inv.id} inv={inv} />)}

      {/* Active investigations */}
      {thinking.map((inv) => <ThinkingCard key={inv.id} inv={inv} />)}

      {/* Pending confirm */}
      {currentPending && <ConfirmCard chunk={currentPending.chunk} />}
      {pending.length > 1 && (
        <Box marginLeft={2} marginBottom={1}>
          <Text color="gray" dimColor>+{pending.length - 1} more error{pending.length > 2 ? "s" : ""} queued</Text>
        </Box>
      )}

      {/* Crashed */}
      {stage === "crashed" && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Box gap={1}>
            <Text color={RED}>✖</Text>
            <Text color="white">process exited{exitCode !== null ? ` (code ${exitCode})` : ""}</Text>
          </Box>
          {autoRestart ? (
            <Box gap={1}>
              <Text color={ACCENT}><Spinner /></Text>
              <Text color="gray" dimColor>restarting…</Text>
            </Box>
          ) : (
            <Box gap={1}>
              <Text color={ACCENT}>r</Text><Text color="white"> restart</Text>
              <Text color="gray" dimColor>  ·  ctrl+c quit</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Footer hint */}
      {stage === "running" && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            watching for errors  ·  ctrl+c stop
            {!fixAll ? "  ·  errors will prompt y/n" : ""}
          </Text>
        </Box>
      )}
    </Box>
  );
}
