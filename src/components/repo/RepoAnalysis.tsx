import React from "react";
import { Box, Text, Static, useInput } from "ink";
import Spinner from "ink-spinner";
import figures from "figures";
import { useState, useRef } from "react";
import { writeFileSync } from "fs";
import path from "path";
import { ACCENT } from "../../colors";
import {
  requestFileList,
  analyzeRepo,
  extractToolingPatch,
} from "../../utils/ai";
import { ProviderPicker } from "../provider/ProviderPicker";
import { PreviewRunner } from "./PreviewRunner";
import { IssueFixer } from "./IssueFixer";
import { writeLensFile, patchLensFile } from "../../utils/lensfile";
import { callChat } from "../../utils/chat";
import { StaticMessage } from "../chat/ChatMessage";
import { InputBox, TypewriterText, ShortcutBar } from "../chat/ChatOverlays";
import type { Provider } from "../../types/config";
import type { AnalysisResult, ImportantFile } from "../../types/repo";
import type { Message } from "../../types/chat";
import { useThinkingPhrase } from "../../utils/thinking";

type AnalysisStage =
  | { type: "picking-provider" }
  | { type: "requesting-files" }
  | { type: "analyzing" }
  | { type: "done"; result: AnalysisResult }
  | { type: "writing" }
  | { type: "written"; filePath: string }
  | { type: "previewing" }
  | { type: "fixing"; result: AnalysisResult }
  | { type: "asking"; result: AnalysisResult }
  | { type: "error"; message: string };

const OUTPUT_FILES = ["CLAUDE.md", "copilot-instructions.md"] as const;
type OutputFile = (typeof OUTPUT_FILES)[number];

function buildMarkdown(repoUrl: string, result: AnalysisResult): string {
  const toolingLines = Object.entries(result.tooling ?? {})
    .map(([k, v]) => `- **${k}**: ${v}`)
    .join("\n");

  return `# Repository Analysis

> ${repoUrl}

## Overview
${result.overview}

## Architecture
${result.architecture ?? ""}

## Tooling
${toolingLines || "- Not determined"}

## Important Folders
${result.importantFolders.map((f) => `- ${f}`).join("\n")}

## Key Files
${(result.keyFiles ?? []).map((f) => `- ${f}`).join("\n")}

## Patterns & Idioms
${(result.patterns ?? []).map((p) => `- ${p}`).join("\n")}

## Suggestions
${result.suggestions.map((s) => `- ${s}`).join("\n")}
`;
}

function buildQASystemPrompt(repoUrl: string, result: AnalysisResult): string {
  const toolingLines = Object.entries(result.tooling ?? {})
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  return `You are a codebase assistant for the repository at ${repoUrl}.

Here is what you know about this codebase:

Overview:
${result.overview}

Architecture:
${result.architecture ?? "Not determined"}

Tooling:
${toolingLines || "Not determined"}

Important Folders:
${result.importantFolders.map((f) => `- ${f}`).join("\n")}

Key Files:
${(result.keyFiles ?? []).map((f) => `- ${f}`).join("\n")}

Patterns & Idioms:
${(result.patterns ?? []).map((p) => `- ${p}`).join("\n")}

Answer questions about this codebase concisely and accurately. If you're unsure about something not covered in the analysis, say so clearly rather than guessing.`;
}

function AskingFilesStep() {
  const phrase = useThinkingPhrase(true, "model");
  return (
    <Box gap={1}>
      <Text color={ACCENT}>
        <Spinner />
      </Text>
      <Text color={ACCENT}>{phrase}</Text>
    </Box>
  );
}

function AnalyzingStep() {
  const phrase = useThinkingPhrase(true, "summary");
  return (
    <Box gap={1}>
      <Text color={ACCENT}>
        <Spinner />
      </Text>
      <Text color={ACCENT}>{phrase}</Text>
    </Box>
  );
}

// ─── CodebaseQA ──────────────────────────────────────────────────────────────

type QAStage = "idle" | "thinking";

function CodebaseQA({
  repoUrl,
  result,
  provider,
  onExit,
}: {
  repoUrl: string;
  result: AnalysisResult;
  provider: Provider;
  onExit: () => void;
}) {
  const [committed, setCommitted] = useState<Message[]>([]);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const [qaStage, setQaStage] = useState<QAStage>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const systemPrompt = buildQASystemPrompt(repoUrl, result);
  const thinkingPhrase = useThinkingPhrase(qaStage === "thinking");

  useInput((_, key) => {
    if (key.escape) {
      if (qaStage === "thinking") {
        abortRef.current?.abort();
        abortRef.current = null;
        setQaStage("idle");
        return;
      }
      onExit();
    }
  });

  const sendQuestion = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: Message = { role: "user", type: "text", content: trimmed };
    const nextAll = [...allMessages, userMsg];
    setCommitted((prev) => [...prev, userMsg]);
    setAllMessages(nextAll);
    setQaStage("thinking");

    const abort = new AbortController();
    abortRef.current = abort;

    callChat(provider, systemPrompt, nextAll, abort.signal)
      .then((answer) => {
        const assistantMsg: Message = {
          role: "assistant",
          type: "text",
          content: answer,
        };
        setCommitted((prev) => [...prev, assistantMsg]);
        setAllMessages([...nextAll, assistantMsg]);
        setQaStage("idle");
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") {
          setQaStage("idle");
          return;
        }
        const errMsg: Message = {
          role: "assistant",
          type: "text",
          content: `Error: ${err instanceof Error ? err.message : "Request failed"}`,
        };
        setCommitted((prev) => [...prev, errMsg]);
        setAllMessages([...nextAll, errMsg]);
        setQaStage("idle");
      });
  };

  return (
    <Box flexDirection="column">
      <Static items={committed}>
        {(msg, i) => <StaticMessage key={i} msg={msg} />}
      </Static>

      {qaStage === "thinking" && (
        <Box gap={1}>
          <Text color={ACCENT}>●</Text>
          <TypewriterText text={thinkingPhrase} />
          <Text color="gray" dimColor>
            · esc cancel
          </Text>
        </Box>
      )}

      {qaStage === "idle" && (
        <Box flexDirection="column">
          <InputBox
            value={inputValue}
            onChange={setInputValue}
            onSubmit={(val) => {
              if (val.trim()) sendQuestion(val.trim());
              setInputValue("");
              setInputKey((k) => k + 1);
            }}
            inputKey={inputKey}
          />
          <Text color="gray" dimColor>
            enter send · esc back
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ─── RepoAnalysis ─────────────────────────────────────────────────────────────

export const RepoAnalysis = ({
  repoUrl,
  repoPath,
  fileTree,
  files: initialFiles,
  preloadedResult,
  onExit,
}: {
  repoUrl: string;
  repoPath: string;
  fileTree: string[];
  files: ImportantFile[];
  preloadedResult?: AnalysisResult;
  onExit?: () => void;
}) => {
  const [stage, setStage] = useState<AnalysisStage>(
    preloadedResult
      ? { type: "done", result: preloadedResult }
      : { type: "picking-provider" },
  );
  const [selectedOutput, setSelectedOutput] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [requestedFiles, setRequestedFiles] = useState<ImportantFile[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);

  const OPTIONS = [
    ...OUTPUT_FILES,
    "Preview repo",
    "Fix issues",
    "Ask questions",
  ] as const;

  const handleProviderDone = (p: Provider) => {
    setProvider(p);
    setStage({ type: "requesting-files" });

    requestFileList(repoUrl, repoPath, fileTree, p)
      .then((files) => {
        setRequestedFiles(files);

        extractToolingPatch(repoUrl, files.length > 0 ? files : initialFiles, p)
          .then((patch) => {
            if (patch) patchLensFile(repoPath, patch);
          })
          .catch(() => {});

        setStage({ type: "analyzing" });
        return analyzeRepo(repoUrl, files.length > 0 ? files : initialFiles, p);
      })
      .then((result) => {
        writeLensFile(repoPath, result);
        setStage({ type: "done", result });
      })
      .catch((err: unknown) =>
        setStage({
          type: "error",
          message: err instanceof Error ? err.message : "Analysis failed",
        }),
      );
  };

  useInput((_, key) => {
    if (stage.type !== "done") return;
    if (key.leftArrow)
      setSelectedOutput((i) => Math.max(0, i - 1) as 0 | 1 | 2 | 3 | 4);
    if (key.rightArrow)
      setSelectedOutput(
        (i) => Math.min(OPTIONS.length - 1, i + 1) as 0 | 1 | 2 | 3 | 4,
      );
    if (key.return) {
      if (selectedOutput === 2) {
        setStage({ type: "previewing" });
        return;
      }
      if (selectedOutput === 3) {
        setStage({ type: "fixing", result: stage.result });
        return;
      }
      if (selectedOutput === 4) {
        setStage({ type: "asking", result: stage.result });
        return;
      }
      const fileName = OUTPUT_FILES[selectedOutput] as OutputFile;
      setStage({ type: "writing" });
      try {
        const filePath = path.join(repoPath, fileName);
        writeFileSync(filePath, buildMarkdown(repoUrl, stage.result), "utf-8");
        setStage({ type: "written", filePath });
      } catch (err: unknown) {
        setStage({
          type: "error",
          message: err instanceof Error ? err.message : "Write failed",
        });
      }
    }
    if (key.escape) setStage({ type: "written", filePath: "" });
  });

  if (stage.type === "picking-provider") {
    return <ProviderPicker onDone={handleProviderDone} />;
  }

  if (stage.type === "requesting-files") {
    return <AskingFilesStep />;
  }

  if (stage.type === "analyzing") {
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <AnalyzingStep />
        {requestedFiles.length > 0 && (
          <Box flexDirection="column" marginLeft={2}>
            <Text color="gray">Reading {requestedFiles.length} files:</Text>
            {requestedFiles.map((f) => (
              <Text key={f.path} color="gray">
                {figures.bullet} {f.path}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  if (stage.type === "writing") {
    return (
      <Box marginTop={1}>
        <Text color={ACCENT}>
          <Spinner />
        </Text>
        <Box marginLeft={1}>
          <Text>Writing file...</Text>
        </Box>
      </Box>
    );
  }

  if (stage.type === "written") {
    setTimeout(() => {
      if (onExit) onExit();
      else process.exit(0);
    }, 100);
    return (
      <Text color="green">
        {figures.tick}{" "}
        {stage.filePath ? `Written to ${stage.filePath}` : "Skipped"}
      </Text>
    );
  }

  if (stage.type === "previewing") {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>
          {figures.play} Preview — {repoPath}
        </Text>
        <PreviewRunner
          repoPath={repoPath}
          onExit={() => {
            setTimeout(() => {
              if (onExit) onExit();
              else process.exit(0);
            }, 100);
          }}
        />
      </Box>
    );
  }

  if (stage.type === "fixing") {
    return (
      <IssueFixer
        repoPath={repoPath}
        result={stage.result}
        requestedFiles={requestedFiles}
        provider={provider!}
        onDone={() => setStage({ type: "done", result: stage.result })}
      />
    );
  }

  if (stage.type === "asking") {
    return (
      <CodebaseQA
        repoUrl={repoUrl}
        result={stage.result}
        provider={provider!}
        onExit={() => setStage({ type: "done", result: stage.result })}
      />
    );
  }

  if (stage.type === "error") {
    return (
      <Text color="red">
        {figures.cross} {stage.message}
      </Text>
    );
  }

  const { result } = stage;

  return (
    <Box flexDirection="column" marginTop={1} gap={1}>
      <Box flexDirection="column">
        <Text bold color="cyan">
          {figures.info} Overview
        </Text>
        <Text color="white">{result.overview}</Text>
      </Box>

      <Box flexDirection="column">
        <Text bold color="cyan">
          {figures.pointerSmall} Architecture
        </Text>
        <Text color="white">{result.architecture}</Text>
      </Box>

      <Box flexDirection="column">
        <Text bold color="cyan">
          {figures.pointerSmall} Tooling
        </Text>
        {Object.entries(result.tooling ?? {}).map(([k, v]) => (
          <Text key={k} color="white">
            {" "}
            {figures.bullet} <Text bold>{k}</Text>: {v}
          </Text>
        ))}
      </Box>

      <Box flexDirection="column">
        <Text bold color="cyan">
          {figures.pointerSmall} Important Folders
        </Text>
        {result.importantFolders.map((f) => (
          <Text key={f} color="white">
            {" "}
            {figures.bullet} {f}
          </Text>
        ))}
      </Box>

      <Box flexDirection="column">
        <Text bold color="cyan">
          {figures.pointerSmall} Key Files
        </Text>
        {(result.keyFiles ?? []).map((f) => (
          <Text key={f} color="white">
            {" "}
            {figures.bullet} {f}
          </Text>
        ))}
      </Box>

      <Box flexDirection="column">
        <Text bold color="cyan">
          {figures.pointerSmall} Patterns & Idioms
        </Text>
        {(result.patterns ?? []).map((p) => (
          <Text key={p} color="white">
            {" "}
            {figures.bullet} {p}
          </Text>
        ))}
      </Box>

      <Box flexDirection="column">
        <Text bold color="green">
          {figures.tick} Suggestions
        </Text>
        {result.suggestions.map((s) => (
          <Text key={s} color="white">
            {" "}
            {figures.bullet} {s}
          </Text>
        ))}
      </Box>

      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text bold color="cyan">
          Actions
        </Text>
        <Box gap={2}>
          {OPTIONS.map((f, i) => (
            <Text key={f} color={selectedOutput === i ? "cyan" : "gray"}>
              {selectedOutput === i ? figures.arrowRight : " "} {f}
            </Text>
          ))}
        </Box>
        <Text color="gray">← → switch · enter to select · esc to skip</Text>
      </Box>
    </Box>
  );
};
