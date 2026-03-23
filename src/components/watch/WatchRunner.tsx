import React, { useState, useEffect, useRef, useMemo } from "react";
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
import type { ErrorChunk, Suggestion, WatchProcess } from "../../utils/watch";
import type { Provider } from "../../types/config";
import type { Message } from "../../types/chat";
import { ACCENT, GREEN, RED, CYAN, TEXT } from "../../colors";

const MAX_LOGS = 120;
const MAX_SUGGESTIONS = 8;

type WatchStage =
  | { type: "picking-provider" }
  | { type: "running" }
  | { type: "crashed"; exitCode: number | null };

interface Props {
  cmd: string;
  repoPath: string;
  clean: boolean;
  fixAll: boolean;
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function buildWatchSystemPrompt(
  repoPath: string,
  deps: string,
  importantFiles: { path: string; content: string }[],
): string {
  const base = buildSystemPrompt(importantFiles, "", undefined);
  return `${base}

## WATCH MODE

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
- If you haven't read the file yet, use read-file first, then respond with the JSON`;
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
}: {
  suggestion: Suggestion;
  isNew: boolean;
}) {
  const w = process.stdout.columns ?? 80;
  const divider = "─".repeat(Math.min(w - 4, 60));

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
        <Box marginLeft={2} marginTop={1} gap={1}>
          <Text color={GREEN}>{figures.tick}</Text>
          <Text color={GREEN}>
            patch applied → <Text color="white">{suggestion.patch.path}</Text>
          </Text>
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

function ThinkingCard({
  chunk,
  toolLog,
}: {
  chunk: ErrorChunk;
  toolLog: string[];
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text color={ACCENT}>
          <Spinner />
        </Text>
        <Text color="gray">investigating...</Text>
        <Text color="gray" dimColor>
          {chunk.lines[0]?.slice(0, 55) ?? ""}
        </Text>
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

type ActiveInvestigation = {
  id: string;
  chunk: ErrorChunk;
  toolLog: string[];
};

export function WatchRunner({ cmd, repoPath, clean, fixAll }: Props) {
  const [stage, setStage] = useState<WatchStage>({ type: "picking-provider" });
  const [logs, setLogs] = useState<{ text: string; isErr: boolean }[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState<ActiveInvestigation[]>([]);
  const [fixedCount, setFixedCount] = useState(0);
  const processRef = useRef<WatchProcess | null>(null);
  const providerRef = useRef<Provider | null>(null);
  const systemPromptRef = useRef<string>("");
  const activeCountRef = useRef(0);
  const pendingExitCode = useRef<number | null | undefined>(undefined);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const { stdout } = useStdout();

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      processRef.current?.kill();
      process.exit(0);
    }
  });

  const handleProviderDone = async (p: Provider) => {
    providerRef.current = p;
    try {
      const fileTree = await fetchFileTree(repoPath).catch(() => []);
      const importantFiles = readImportantFiles(repoPath, fileTree);
      const deps = readPackageJson(repoPath);
      systemPromptRef.current = buildWatchSystemPrompt(
        repoPath,
        deps,
        importantFiles,
      );
    } catch {
      systemPromptRef.current = buildWatchSystemPrompt(repoPath, "", []);
    }
    setStage({ type: "running" });
    startWatching();
  };

  // ── spawn process ─────────────────────────────────────────────────────────

  const startWatching = () => {
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
      const abort = new AbortController();
      abortControllersRef.current.set(id, abort);
      activeCountRef.current += 1;
      setActive((prev) => [...prev, { id, chunk, toolLog: [] }]);

      const initialMessages: Message[] = [
        { role: "user", content: buildErrorPrompt(chunk), type: "text" },
      ];
      runInvestigation(id, chunk, initialMessages, abort.signal);
    });

    proc.onExit((code) => {
      pendingExitCode.current = code;
      // defer by one tick so any onError callbacks fired in the same flush
      // have time to increment activeCountRef before we check it
      setTimeout(() => {
        if (activeCountRef.current === 0) {
          setStage({ type: "crashed", exitCode: code });
        }
      }, 0);
    });
  };

  // unmount cleanup
  useEffect(() => {
    return () => {
      processRef.current?.kill();
      abortControllersRef.current.forEach((a) => a.abort());
    };
  }, []);

  const runInvestigation = async (
    id: string,
    chunk: ErrorChunk,
    messages: Message[],
    signal: AbortSignal,
    startTime = Date.now(),
  ): Promise<void> => {
    const provider = providerRef.current;
    if (!provider || signal.aborted) return;

    try {
      const raw = await callChat(
        provider,
        systemPromptRef.current,
        messages,
        signal,
      );
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

        // safe tools always auto-approved; writes auto-approved with --fix-all
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

        return runInvestigation(id, chunk, nextMessages, signal);
      }

      // text — parse as JSON suggestion
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
          } catch {}
        }

        setSuggestions((prev) => {
          const next = [...prev, suggestion];
          return next.length > MAX_SUGGESTIONS
            ? next.slice(-MAX_SUGGESTIONS)
            : next;
        });
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      // surface the error as a failed suggestion so it's visible
      const errMsg = e?.message ?? String(e);
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
    } finally {
      // keep thinking card visible for at least 800ms so it doesn't flash
      const elapsed = Date.now() - startTime;
      const minDisplay = 800;
      if (elapsed < minDisplay) {
        await new Promise((r) => setTimeout(r, minDisplay - elapsed));
      }
      activeCountRef.current -= 1;
      setActive((prev) => prev.filter((a) => a.id !== id));
      // defer crash so suggestions have time to render before stage changes
      if (
        activeCountRef.current === 0 &&
        pendingExitCode.current !== undefined
      ) {
        setTimeout(() => {
          setStage({ type: "crashed", exitCode: pendingExitCode.current! });
        }, 100);
      }
    }
  };

  // ── tool execution loop ───────────────────────────────────────────────────

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

      {(suggestions.length > 0 || active.length > 0) && (
        <Box marginBottom={1} gap={1}>
          <Text color={ACCENT} bold>
            ◈ LENS
          </Text>
          {fixAll && <Text color={GREEN}>· auto-fixing</Text>}
        </Box>
      )}

      {active.map((a) => (
        <ThinkingCard key={a.id} chunk={a.chunk} toolLog={a.toolLog} />
      ))}

      {suggestions.map((s, i) => (
        <SuggestionCard
          key={s.id}
          suggestion={s}
          isNew={i === suggestions.length - 1}
        />
      ))}

      {clean && suggestions.length === 0 && active.length === 0 && (
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
            <Text color={RED}>{figures.cross}</Text>
            <Text color="white">
              process exited
              {stage.exitCode !== null ? ` (code ${stage.exitCode})` : ""}
            </Text>
          </Box>
          <Text color="gray">ctrl+c to quit</Text>
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
