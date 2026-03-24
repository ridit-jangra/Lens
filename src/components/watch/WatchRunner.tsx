import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import figures from "figures";
import { nanoid } from "nanoid";
import { spawnWatch, readPackageJson } from "../../utils/watch";
import { callChat, parseResponse } from "../../utils/chat";
import { registry } from "../../utils/tools/registry";
import { applyPatches } from "../../tools/files";
import { buildSystemPrompt } from "../../prompts";
import { ProviderPicker } from "../provider/ProviderPicker";
import { fetchFileTree, readImportantFiles } from "../../utils/files";
import { lensFileExists, readLensFile } from "../../utils/lensfile";
import type { ErrorChunk, Suggestion, WatchProcess } from "../../utils/watch";
import type { Provider } from "../../types/config";
import type { Message } from "../../types/chat";
import { ACCENT, GREEN, RED, CYAN, TEXT } from "../../colors";

const MAX_LOGS = 120;
const MAX_SUGGESTIONS = 8;

type WatchStage =
  | { type: "picking-provider" }
  | { type: "running" }
  | { type: "crashed"; exitCode: number | null; patchedCount: number };

type PendingError = {
  id: string;
  chunk: ErrorChunk;
};

interface Props {
  cmd: string;
  repoPath: string;
  clean: boolean;
  fixAll: boolean;
  autoRestart: boolean;
  extraPrompt?: string;
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function buildWatchSystemPrompt(
  repoPath: string,
  deps: string,
  importantFiles: { path: string; content: string }[],
  lensContext: string,
  extraPrompt: string,
): string {
  const base = buildSystemPrompt(importantFiles, "", undefined);

  const sections: string[] = [base];

  if (lensContext) {
    sections.push(`## PROJECT CONTEXT (from LENS.md)\n\n${lensContext}`);
  }

  if (extraPrompt) {
    sections.push(
      `## ADDITIONAL CONTEXT (HIGHEST PRIORITY — override your assumptions with this)\n\n${extraPrompt}\n\nWhen providing patches, you MUST follow the above context. Do not guess intent — use exactly what is described above.`,
    );
  }

  sections.push(`## WATCH MODE

You are monitoring a running dev process at: ${repoPath}
${deps ? `Project dependencies: ${deps}` : ""}

When an error occurs you will be given the error output. You should:
1. Use your tools to investigate — read the erroring file, grep for related patterns, check imports
2. Explain the error in plain language (2-3 sentences max)
3. Give a specific fix referencing actual file names and line numbers

After investigating, respond ONLY with this exact JSON (no markdown, no backticks):
{
  "errorSummary": "one line — what went wrong",
  "simplified": "2-3 sentences plain language explanation",
  "fix": "specific actionable fix with file names and line numbers",
  "patch": null
}

If confident in a code fix, replace patch with:
{ "path": "relative/path.ts", "content": "complete corrected file content", "isNew": false }

CRITICAL patch rules:
- You MUST read the file with read-file BEFORE providing a patch
- The patch content must be the COMPLETE file with ONLY the broken lines changed
- Do NOT simplify, rewrite, or remove any existing code
- Do NOT invent new content — preserve every function, comment, and line exactly as-is except the fix
- If you haven't read the file yet, use read-file first, then respond with the JSON`);

  return sections.join("\n\n");
}

function buildErrorPrompt(chunk: ErrorChunk): string {
  return `Error detected in dev process:

\`\`\`
${chunk.lines.join("\n").slice(0, 2000)}
\`\`\`

${chunk.contextBefore.length > 0 ? `Log context before error:\n\`\`\`\n${chunk.contextBefore.join("\n")}\n\`\`\`` : ""}
${chunk.filePath ? `Error file: ${chunk.filePath}${chunk.lineNumber ? `:${chunk.lineNumber}` : ""}` : ""}

Use read-file to read the full file content first, then respond with the JSON. Do not provide a patch without reading the file first.`;
}

function SuggestionCard({
  suggestion,
  isNew,
  fixAll,
  repoPath,
}: {
  suggestion: Suggestion;
  isNew: boolean;
  fixAll: boolean;
  repoPath: string;
}) {
  const w = process.stdout.columns ?? 80;
  const divider = "─".repeat(Math.min(w - 4, 60));

  const [patchState, setPatchState] = useState<
    null | "applied" | "skipped" | "error"
  >(fixAll && suggestion.patch ? "applied" : null);

  useInput((input) => {
    if (!isNew || !suggestion.patch || patchState !== null || fixAll) return;
    if (input === "y" || input === "Y") {
      try {
        applyPatches(repoPath, [suggestion.patch!]);
        setPatchState("applied");
      } catch {
        setPatchState("error");
      }
    } else if (input === "n" || input === "N") {
      setPatchState("skipped");
    }
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="gray">{divider}</Text>
      <Box gap={1}>
        <Text color={RED}>✖</Text>
        <Text color="white" bold>
          {suggestion.errorSummary}
        </Text>
        {isNew && (
          <Text color={ACCENT} bold>
            [new]
          </Text>
        )}
      </Box>
      <Box marginLeft={2}>
        <Text color="gray">{suggestion.simplified}</Text>
      </Box>
      <Box marginLeft={2} marginTop={1} flexDirection="column">
        <Text color={CYAN} bold>
          fix →
        </Text>
        <Box marginLeft={2}>
          <Text color={TEXT}>{suggestion.fix}</Text>
        </Box>
      </Box>
      {suggestion.patch && (
        <Box marginLeft={2} marginTop={1} flexDirection="column" gap={1}>
          {patchState === "applied" && (
            <Box gap={1}>
              <Text color={ACCENT}>✔</Text>
              <Text color={GREEN}>
                patch applied →{" "}
                <Text color="white">{suggestion.patch.path}</Text>
              </Text>
            </Box>
          )}
          {patchState === "skipped" && (
            <Box gap={1}>
              <Text color="gray" dimColor>
                ✗
              </Text>
              <Text color="gray" dimColor>
                patch skipped
              </Text>
            </Box>
          )}
          {patchState === "error" && (
            <Box gap={1}>
              <Text color={RED}>✗</Text>
              <Text color={RED}>failed to apply patch</Text>
            </Box>
          )}
          {patchState === null && !fixAll && (
            <Box gap={1}>
              <Text color="gray" dimColor>
                {figures.pointer}
              </Text>
              <Text color="gray" dimColor>
                {suggestion.patch.path}
              </Text>
              <Text color="gray" dimColor>
                ·
              </Text>
              <Text color={ACCENT} bold>
                y
              </Text>
              <Text color="white">apply patch</Text>
              <Text color="gray" dimColor>
                ·
              </Text>
              <Text color="gray" bold>
                n
              </Text>
              <Text color="gray">skip</Text>
            </Box>
          )}
        </Box>
      )}
      {suggestion.filePath && (
        <Box marginLeft={2} gap={1}>
          <Text color="gray" dimColor>
            {figures.pointer}
          </Text>
          <Text color="gray" dimColor>
            {suggestion.filePath}
          </Text>
        </Box>
      )}
    </Box>
  );
}

const INVESTIGATION_TIMEOUT_MS = 60_000;

function ThinkingCard({
  chunk,
  toolLog,
  startTime,
}: {
  chunk: ErrorChunk;
  toolLog: string[];
  startTime: number;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startTime) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [startTime]);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text color={ACCENT}>
          <Spinner />
        </Text>
        <Text color="gray" dimColor>
          {chunk.lines[0]?.slice(0, 50) ?? ""}
        </Text>
        <Text color="gray" dimColor>
          {elapsed}s
        </Text>
        <Text color="gray">investigating...</Text>
      </Box>
      {toolLog.slice(-3).map((t, i) => (
        <Box key={i} marginLeft={2} gap={1}>
          <Text color="gray" dimColor>
            $
          </Text>
          <Text color="gray" dimColor>
            {t}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function ConfirmCard({ pending }: { pending: PendingError }) {
  const w = process.stdout.columns ?? 80;
  const divider = "─".repeat(Math.min(w - 4, 60));
  const preview = pending.chunk.lines[0]?.slice(0, 60) ?? "error detected";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="gray">{divider}</Text>
      <Box gap={1}>
        <Text color={RED}>✖</Text>
        <Text color="white">{preview}</Text>
      </Box>
      {pending.chunk.filePath && (
        <Box marginLeft={2} gap={1}>
          <Text color="gray" dimColor>
            {figures.pointer}
          </Text>
          <Text color="gray" dimColor>
            {pending.chunk.filePath}
            {pending.chunk.lineNumber ? `:${pending.chunk.lineNumber}` : ""}
          </Text>
        </Box>
      )}
      <Box marginLeft={2} marginTop={1} gap={1}>
        <Text color={ACCENT} bold>
          y
        </Text>
        <Text color="white">investigate</Text>
        <Text color="gray" dimColor>
          ·
        </Text>
        <Text color="gray" bold>
          n
        </Text>
        <Text color="gray">skip</Text>
      </Box>
    </Box>
  );
}

function InputCard({ prompt, value }: { prompt: string; value: string }) {
  const w = process.stdout.columns ?? 80;
  const divider = "─".repeat(Math.min(w - 4, 60));

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="gray">{divider}</Text>
      <Box gap={1}>
        <Text color={CYAN} bold>
          ⌨
        </Text>
        <Text color="white">{prompt}</Text>
      </Box>
      <Box marginLeft={2} marginTop={1} gap={1}>
        <Text color={ACCENT}>&gt;</Text>
        <Text color="white">{value}</Text>
        <Text color={ACCENT}>▋</Text>
      </Box>
      <Box marginLeft={2}>
        <Text color="gray" dimColor>
          enter to confirm
        </Text>
      </Box>
    </Box>
  );
}

type ActiveInvestigation = {
  id: string;
  chunk: ErrorChunk;
  toolLog: string[];
  startTime: number;
};

export function WatchRunner({
  cmd,
  repoPath,
  clean,
  fixAll,
  autoRestart,
  extraPrompt,
}: Props) {
  const [stage, setStage] = useState<WatchStage>({ type: "picking-provider" });
  const [logs, setLogs] = useState<{ text: string; isErr: boolean }[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState<ActiveInvestigation[]>([]);
  const [lensLoaded, setLensLoaded] = useState(false);

  const [pendingQueue, setPendingQueue] = useState<PendingError[]>([]);
  const [fixedCount, setFixedCount] = useState(0);
  const [inputRequest, setInputRequest] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const processRef = useRef<WatchProcess | null>(null);
  const providerRef = useRef<Provider | null>(null);
  const systemPromptRef = useRef<string>("");
  const activeCountRef = useRef(0);
  const pendingExitCode = useRef<number | null | undefined>(undefined);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const patchedThisRunRef = useRef(0);
  const { stdout } = useStdout();

  const currentPending = pendingQueue[0] ?? null;

  const handleRestart = () => {
    pendingExitCode.current = undefined;
    activeCountRef.current = 0;
    abortControllersRef.current.forEach((a) => a.abort());
    abortControllersRef.current.clear();
    processRef.current?.kill();

    setActive([]);
    setSuggestions([]);
    setLogs([]);
    setPendingQueue([]);
    setStage({ type: "running" });
    startWatching();
  };

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

    if (stage.type === "crashed" && (input === "r" || input === "R")) {
      handleRestart();
    }

    if (currentPending) {
      if (input === "y" || input === "Y") {
        const confirmed = currentPending;
        setPendingQueue((prev) => prev.filter((p) => p.id !== confirmed.id));
        dispatchInvestigation(confirmed.id, confirmed.chunk);
      } else if (input === "n" || input === "N") {
        activeCountRef.current -= 1;
        setPendingQueue((prev) =>
          prev.filter((p) => p.id !== currentPending.id),
        );
        if (
          activeCountRef.current === 0 &&
          pendingExitCode.current !== undefined
        ) {
          setStage({
            type: "crashed",
            exitCode: pendingExitCode.current,
            patchedCount: patchedThisRunRef.current,
          });
        }
      }
    }
  });

  const handleProviderDone = async (p: Provider) => {
    providerRef.current = p;
    try {
      const fileTree = await fetchFileTree(repoPath).catch(() => []);
      const importantFiles = readImportantFiles(repoPath, fileTree);
      const deps = readPackageJson(repoPath);

      let lensContext = "";
      if (lensFileExists(repoPath)) {
        const lensFile = readLensFile(repoPath);
        if (lensFile) {
          setLensLoaded(true);
          lensContext = `Overview: ${lensFile.overview}

Important folders: ${lensFile.importantFolders.join(", ")}
${lensFile.securityIssues.length > 0 ? `\nKnown security issues:\n${lensFile.securityIssues.map((s) => `- ${s}`).join("\n")}` : ""}
${lensFile.suggestions.length > 0 ? `\nProject suggestions:\n${lensFile.suggestions.map((s) => `- ${s}`).join("\n")}` : ""}`;
        }
      }

      systemPromptRef.current = buildWatchSystemPrompt(
        repoPath,
        deps,
        importantFiles,
        lensContext,
        extraPrompt ?? "",
      );
    } catch {
      systemPromptRef.current = buildWatchSystemPrompt(
        repoPath,
        "",
        [],
        "",
        extraPrompt ?? "",
      );
    }
    setStage({ type: "running" });
    startWatching();
  };

  const startWatching = () => {
    patchedThisRunRef.current = 0;
    const proc = spawnWatch(cmd, repoPath);
    processRef.current = proc;

    proc.onLog((line, isErr) => {
      const text = stripAnsi(line).slice(0, 200);
      setLogs((prev) => {
        const next = [...prev, { text, isErr }];
        return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
      });
    });

    proc.onError((chunk: ErrorChunk) => {
      const id = nanoid(6);

      activeCountRef.current += 1;

      if (fixAll) {
        const abort = new AbortController();
        abortControllersRef.current.set(id, abort);
        const t = Date.now();
        setActive((prev) => [
          ...prev,
          { id, chunk, toolLog: [], startTime: t },
        ]);
        const initialMessages: Message[] = [
          { role: "user", content: buildErrorPrompt(chunk), type: "text" },
        ];
        runInvestigation(id, chunk, initialMessages, abort.signal, t);
      } else {
        setPendingQueue((prev) => [...prev, { id, chunk }]);
      }
    });

    proc.onInputRequest((prompt) => {
      setInputRequest(prompt);
      setInputValue("");
    });

    proc.onExit((code) => {
      pendingExitCode.current = code;
      setTimeout(() => {
        if (activeCountRef.current === 0) {
          setStage({
            type: "crashed",
            exitCode: code,
            patchedCount: patchedThisRunRef.current,
          });
        }
      }, 0);
    });
  };

  const dispatchInvestigation = (id: string, chunk: ErrorChunk) => {
    const abort = new AbortController();
    abortControllersRef.current.set(id, abort);
    const t = Date.now();
    setActive((prev) => [...prev, { id, chunk, toolLog: [], startTime: t }]);
    const initialMessages: Message[] = [
      { role: "user", content: buildErrorPrompt(chunk), type: "text" },
    ];
    runInvestigation(id, chunk, initialMessages, abort.signal, t);
  };

  useEffect(() => {
    return () => {
      processRef.current?.kill();
      abortControllersRef.current.forEach((a) => a.abort());
    };
  }, []);

  useEffect(() => {
    if (autoRestart && stage.type === "crashed") {
      const t = setTimeout(() => handleRestart(), 1500);
      return () => clearTimeout(t);
    }
  }, [stage.type]);

  const runInvestigation = async (
    id: string,
    chunk: ErrorChunk,
    messages: Message[],
    signal: AbortSignal,
    startTime = Date.now(),
  ): Promise<void> => {
    const provider = providerRef.current;
    if (!provider || signal.aborted) return;

    const finishInvestigation = () => {
      activeCountRef.current -= 1;
      setActive((prev) => prev.filter((a) => a.id !== id));
      if (
        activeCountRef.current === 0 &&
        pendingExitCode.current !== undefined
      ) {
        setTimeout(() => {
          setStage({
            type: "crashed",
            exitCode: pendingExitCode.current!,
            patchedCount: patchedThisRunRef.current,
          });
        }, 100);
      }
    };

    try {
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(
        () => timeoutController.abort(),
        INVESTIGATION_TIMEOUT_MS,
      );
      const combinedSignal = AbortSignal.any
        ? AbortSignal.any([signal, timeoutController.signal])
        : signal;

      let raw: string;
      try {
        raw = await callChat(
          provider,
          systemPromptRef.current,
          messages,
          combinedSignal,
        );
      } finally {
        clearTimeout(timeoutId);
      }
      if (signal.aborted) return;

      const parsed = parseResponse(raw);

      if (parsed.kind === "tool") {
        const tool = registry.get(parsed.toolName);
        if (!tool) throw new Error(`unknown tool: ${parsed.toolName}`);

        const label = tool.summariseInput
          ? String(tool.summariseInput(parsed.input))
          : parsed.toolName;

        setActive((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, toolLog: [...a.toolLog, label] } : a,
          ),
        );

        const approved = tool.safe || fixAll;
        let result = "(denied)";

        if (approved) {
          try {
            const r = await tool.execute(parsed.input, { repoPath, messages });
            result = r.value;
            if ((r as any).kind === "image") {
              stdout.write(result + "\n");
              result = "(image rendered)";
            }
          } catch (e: any) {
            result = `Error: ${e.message}`;
          }
        }

        const nextMessages: Message[] = [
          ...messages,
          {
            role: "user" as const,
            content: approved
              ? `Tool result for <${parsed.toolName}>:\n${result}`
              : `Tool <${parsed.toolName}> was denied.`,
            type: "text" as const,
          },
        ];

        return runInvestigation(id, chunk, nextMessages, signal, startTime);
      }

      const text = parsed.kind === "text" ? parsed.content : raw;
      const cleaned = text.replace(/```json|```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);

      if (match) {
        const data = JSON.parse(match[0]) as {
          errorSummary: string;
          simplified: string;
          fix: string;
          patch?: { path: string; content: string; isNew: boolean } | null;
        };

        const suggestion: Suggestion = {
          id,
          errorSummary: data.errorSummary,
          simplified: data.simplified,
          fix: data.fix,
          filePath: chunk.filePath,
          patch: data.patch ?? undefined,
          timestamp: Date.now(),
        };

        if (fixAll && data.patch) {
          try {
            applyPatches(repoPath, [data.patch]);
            setFixedCount((n) => n + 1);
            patchedThisRunRef.current += 1;
          } catch {}
        }

        const elapsed = Date.now() - startTime;
        if (elapsed < 800)
          await new Promise((r) => setTimeout(r, 800 - elapsed));

        setSuggestions((prev) => {
          const next = [...prev, suggestion];
          return next.length > MAX_SUGGESTIONS
            ? next.slice(-MAX_SUGGESTIONS)
            : next;
        });
        finishInvestigation();
      } else {
        const elapsed = Date.now() - startTime;
        if (elapsed < 800)
          await new Promise((r) => setTimeout(r, 800 - elapsed));
        finishInvestigation();
      }
    } catch (e: any) {
      if (e?.name === "AbortError" && signal.aborted) return;

      const errMsg =
        e?.name === "AbortError"
          ? `Timed out after ${INVESTIGATION_TIMEOUT_MS / 1000}s — provider may be slow or unreachable`
          : (e?.message ?? String(e));
      const elapsed = Date.now() - startTime;
      if (elapsed < 800) await new Promise((r) => setTimeout(r, 800 - elapsed));

      setSuggestions((prev) => [
        ...prev,
        {
          id,
          errorSummary: chunk.lines[0]?.slice(0, 80) ?? "Error",
          simplified: `Investigation failed: ${errMsg}`,
          fix: "Check your provider config or try again.",
          filePath: chunk.filePath,
          timestamp: Date.now(),
        },
      ]);
      finishInvestigation();
    }
  };

  if (stage.type === "picking-provider") {
    return <ProviderPicker onDone={handleProviderDone} />;
  }

  const w = process.stdout.columns ?? 80;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text color={ACCENT} bold>
          ◈ SPY{" "}
          <Text color="white" bold={false}>
            {cmd}
          </Text>
          {clean && (
            <Text color="gray" bold={false}>
              {" "}
              --clean
            </Text>
          )}
          {fixAll && (
            <Text color={GREEN} bold={false}>
              {" "}
              --fix-all
            </Text>
          )}
          {autoRestart && (
            <Text color={CYAN} bold={false}>
              {" "}
              --auto-restart
            </Text>
          )}
          {extraPrompt && (
            <Text color="gray" bold={false}>
              {" "}
              --prompt
            </Text>
          )}
          {lensLoaded && (
            <Text color={ACCENT} bold={false}>
              {" "}
              [LENS.md]
            </Text>
          )}
          {fixedCount > 0 && (
            <Text color={GREEN} bold={false}>
              {" "}
              ({fixedCount} fixed)
            </Text>
          )}
        </Text>
        <Text color="gray">{"═".repeat(Math.min(w, 80))}</Text>
      </Box>

      {!clean && (
        <Box flexDirection="column" marginBottom={1}>
          {logs
            .slice(-Math.max(4, (process.stdout.rows ?? 24) - 10))
            .map((log, i) => (
              <Text
                key={i}
                color={log.isErr ? RED : "gray"}
                dimColor={!log.isErr}
              >
                {log.text}
              </Text>
            ))}
          {stage.type === "running" && logs.length === 0 && (
            <Box gap={1}>
              <Text color={ACCENT}>
                <Spinner />
              </Text>
              <Text color="gray">waiting for output...</Text>
            </Box>
          )}
        </Box>
      )}

      {inputRequest !== null && (
        <InputCard prompt={inputRequest} value={inputValue} />
      )}

      {(suggestions.length > 0 || active.length > 0 || currentPending) && (
        <Box marginBottom={1} gap={1}>
          <Text color={ACCENT} bold>
            ◈ LENS
          </Text>
          {fixAll && <Text color={GREEN}>· auto-fixing</Text>}
        </Box>
      )}

      {currentPending && <ConfirmCard pending={currentPending} />}

      {pendingQueue.length > 1 && (
        <Box marginLeft={2} marginBottom={1}>
          <Text color="gray" dimColor>
            +{pendingQueue.length - 1} more error
            {pendingQueue.length - 1 > 1 ? "s" : ""} queued
          </Text>
        </Box>
      )}

      {active.map((a) => (
        <ThinkingCard
          key={a.id}
          chunk={a.chunk}
          toolLog={a.toolLog}
          startTime={a.startTime}
        />
      ))}

      {suggestions.map((s, i) => (
        <SuggestionCard
          key={s.id}
          suggestion={s}
          isNew={i === suggestions.length - 1}
          fixAll={fixAll}
          repoPath={repoPath}
        />
      ))}

      {clean &&
        suggestions.length === 0 &&
        active.length === 0 &&
        !currentPending && (
          <Box gap={1} marginTop={1}>
            <Text color={ACCENT}>
              <Spinner />
            </Text>
            <Text color="gray">watching for errors...</Text>
          </Box>
        )}

      {stage.type === "crashed" && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Box gap={1}>
            <Text color={RED}>✗</Text>
            <Text color="white">
              process exited
              {stage.exitCode !== null ? ` (code ${stage.exitCode})` : ""}
            </Text>
          </Box>
          {autoRestart && stage.patchedCount > 0 && stage.exitCode !== 0 ? (
            <Box gap={1}>
              <Text color={ACCENT}>
                <Spinner />
              </Text>
              <Text color="gray">restarting...</Text>
            </Box>
          ) : stage.patchedCount > 0 ? (
            <Box flexDirection="column" gap={1}>
              <Box gap={1}>
                <Text color={ACCENT}>✔</Text>
                <Text color={GREEN}>
                  {stage.patchedCount} patch{stage.patchedCount > 1 ? "es" : ""}{" "}
                  applied
                </Text>
              </Box>
              <Box gap={1}>
                <Text color={ACCENT} bold>
                  r
                </Text>
                <Text color="white">re-run to verify fixes</Text>
                <Text color="gray" dimColor>
                  · ctrl+c to quit
                </Text>
              </Box>
            </Box>
          ) : (
            <Box gap={1}>
              <Text color={ACCENT} bold>
                r
              </Text>
              <Text color="white">re-run</Text>
              <Text color="gray" dimColor>
                · ctrl+c to quit
              </Text>
            </Box>
          )}
        </Box>
      )}

      {stage.type === "running" && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            ctrl+c to stop
            {!fixAll && suggestions.some((s) => s.patch)
              ? " · patches available (use --fix-all to auto-apply)"
              : ""}
          </Text>
        </Box>
      )}
    </Box>
  );
}
