import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import figures from "figures";
import { useState } from "react";
import { writeFileSync } from "fs";
import path from "path";
import { ACCENT } from "../../colors";
import { requestFileList, analyzeRepo } from "../../utils/ai";
import { ProviderPicker } from "./ProviderPicker";
import { PreviewRunner } from "./PreviewRunner";
import { IssueFixer } from "./IssueFixer";
import { writeLensFile } from "../../utils/lensfile";
import type { Provider } from "../../types/config";
import type { AnalysisResult, ImportantFile } from "../../types/repo";
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
  | { type: "error"; message: string };

const OUTPUT_FILES = ["CLAUDE.md", "copilot-instructions.md"] as const;
type OutputFile = (typeof OUTPUT_FILES)[number];

function buildMarkdown(repoUrl: string, result: AnalysisResult): string {
  return `# Repository Analysis

> ${repoUrl}

## Overview
${result.overview}

## Important Folders
${result.importantFolders.map((f) => `- ${f}`).join("\n")}

## Missing Configs
${
  result.missingConfigs.length > 0
    ? result.missingConfigs.map((f) => `- ${f}`).join("\n")
    : "- None detected"
}

## Security Issues
${
  result.securityIssues.length > 0
    ? result.securityIssues.map((s) => `- ⚠️ ${s}`).join("\n")
    : "- None detected"
}

## Suggestions
${result.suggestions.map((s) => `- ${s}`).join("\n")}
`;
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

export const RepoAnalysis = ({
  repoUrl,
  repoPath,
  fileTree,
  files: initialFiles,
  preloadedResult,
}: {
  repoUrl: string;
  repoPath: string;
  fileTree: string[];
  files: ImportantFile[];
  preloadedResult?: AnalysisResult;
}) => {
  const [stage, setStage] = useState<AnalysisStage>(
    preloadedResult
      ? { type: "done", result: preloadedResult }
      : { type: "picking-provider" },
  );
  const [selectedOutput, setSelectedOutput] = useState<0 | 1 | 2 | 3>(0);
  const [requestedFiles, setRequestedFiles] = useState<ImportantFile[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);

  const OPTIONS = [...OUTPUT_FILES, "Preview repo", "Fix issues"] as const;

  const handleProviderDone = (p: Provider) => {
    setProvider(p);
    setStage({ type: "requesting-files" });
    requestFileList(repoUrl, repoPath, fileTree, p)
      .then((files) => {
        setRequestedFiles(files);
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
      setSelectedOutput((i) => Math.max(0, i - 1) as 0 | 1 | 2 | 3);
    if (key.rightArrow)
      setSelectedOutput(
        (i) => Math.min(OPTIONS.length - 1, i + 1) as 0 | 1 | 2 | 3,
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
    setTimeout(() => process.exit(0), 100);
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
        <PreviewRunner repoPath={repoPath} onExit={() => process.exit(0)} />
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
        <Text bold color="yellow">
          {figures.warning} Missing Configs
        </Text>
        {result.missingConfigs.length > 0 ? (
          result.missingConfigs.map((f) => (
            <Text key={f} color="yellow">
              {" "}
              {figures.bullet} {f}
            </Text>
          ))
        ) : (
          <Text color="gray"> None detected</Text>
        )}
      </Box>

      <Box flexDirection="column">
        <Text bold color="red">
          {figures.cross} Security Issues
        </Text>
        {result.securityIssues.length > 0 ? (
          result.securityIssues.map((s) => (
            <Text key={s} color="red">
              {" "}
              {figures.bullet} {s}
            </Text>
          ))
        ) : (
          <Text color="gray"> None detected</Text>
        )}
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
