import React from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import figures from "figures";
import { useState } from "react";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { ORANGE } from "../../colors";
import { callModelRaw } from "../../utils/ai";
import { DiffViewer, buildDiffs } from "../repo/DiffViewer";
import { ProviderPicker } from "../repo/ProviderPicker";
import type { DiffLine, FilePatch } from "../repo/DiffViewer";
import type { Provider } from "../../types/config";
import type { ImportantFile } from "../../types/repo";
import { fetchFileTree, readImportantFiles } from "../../utils/files";
import { readFileSync, readdirSync, statSync } from "fs";

type Stage =
  | { type: "picking-provider" }
  | { type: "reading-files" }
  | { type: "thinking" }
  | {
      type: "preview";
      plan: PromptPlan;
      diffLines: DiffLine[][];
      scrollOffset: number;
    }
  | { type: "applying" }
  | { type: "done"; applied: AppliedFile[] }
  | {
      type: "viewing-file";
      file: AppliedFile;
      diffLines: DiffLine[];
      scrollOffset: number;
    }
  | { type: "error"; message: string };

type PromptPlan = {
  summary: string;
  patches: FilePatch[];
};

type AppliedFile = {
  path: string;
  isNew: boolean;
  patch: FilePatch;
};

function buildPrompt(userPrompt: string, files: ImportantFile[]): string {
  const fileList = files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
    .join("\n\n");

  return `You are a senior software engineer working on a codebase. The user has made the following request:

"${userPrompt}"

Here are the relevant files in the codebase:

${fileList}

Fulfill the user's request by providing the complete new content for any files that need to be created or modified.

Respond ONLY with a JSON object (no markdown, no explanation) with this exact shape:
{
  "summary": "2-3 sentence explanation of what you did and why",
  "patches": [
    {
      "path": "relative/path/to/file.ts",
      "content": "complete new file content here",
      "isNew": false
    }
  ]
}

Rules:
- Always provide the COMPLETE file content, not diffs or partial content
- isNew should be true only if you are creating a brand new file
- Only include files that actually need changes
- Keep changes focused on fulfilling the request
- Do not change unrelated code
- If the request is impossible or unclear, return an empty patches array with an explanation in summary`;
}

function applyPatches(repoPath: string, plan: PromptPlan): AppliedFile[] {
  const applied: AppliedFile[] = [];
  for (const patch of plan.patches) {
    const fullPath = path.join(repoPath, patch.path);
    const dir = path.dirname(fullPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, patch.content, "utf-8");
    applied.push({ path: patch.path, isNew: patch.isNew, patch });
  }
  return applied;
}

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

export const PromptRunner = ({
  repoPath,
  userPrompt,
}: {
  repoPath: string;
  userPrompt: string;
}) => {
  const [stage, setStage] = useState<Stage>({ type: "picking-provider" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [files, setFiles] = useState<ImportantFile[]>([]);

  const handleProviderDone = (provider: Provider) => {
    setStage({ type: "reading-files" });

    fetchFileTree(repoPath)
      .catch(() => walkDir(repoPath))
      .then((fileTree) => {
        const importantFiles = readImportantFiles(repoPath, fileTree);
        setFiles(importantFiles);
        setStage({ type: "thinking" });
        return callModelRaw(provider, buildPrompt(userPrompt, importantFiles));
      })
      .then((text) => {
        const cleaned = text.replace(/```json|```/g, "").trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("No JSON in model response");
        const plan = JSON.parse(match[0]) as PromptPlan;

        if (plan.patches.length === 0) {
          setStage({
            type: "error",
            message: plan.summary || "Model made no changes.",
          });
          return;
        }

        const diffLines = buildDiffs(repoPath, plan.patches);
        setStage({ type: "preview", plan, diffLines, scrollOffset: 0 });
      })
      .catch((err: unknown) =>
        setStage({
          type: "error",
          message: err instanceof Error ? err.message : "Something went wrong",
        }),
      );
  };

  useInput((_, key) => {
    if (stage.type === "preview") {
      if (key.upArrow)
        setStage({
          ...stage,
          scrollOffset: Math.max(0, stage.scrollOffset - 1),
        });
      if (key.downArrow)
        setStage({ ...stage, scrollOffset: stage.scrollOffset + 1 });
      if (key.escape) {
        process.exit(0);
        return;
      }
      if (key.return) {
        setStage({ type: "applying" });
        try {
          const applied = applyPatches(repoPath, stage.plan);
          setStage({ type: "done", applied });
        } catch (err: unknown) {
          setStage({
            type: "error",
            message:
              err instanceof Error ? err.message : "Failed to write files",
          });
        }
      }
      return;
    }

    if (stage.type === "done") {
      if (key.escape) {
        process.exit(0);
        return;
      }
      if (key.upArrow) setSelectedIndex((i) => Math.max(0, i - 1));
      if (key.downArrow)
        setSelectedIndex((i) => Math.min(stage.applied.length - 1, i + 1));
      if (key.return) {
        const file = stage.applied[selectedIndex];
        if (!file) return;
        const diffLines = buildDiffs(repoPath, [file.patch])[0] ?? [];
        setStage({ type: "viewing-file", file, diffLines, scrollOffset: 0 });
      }
      return;
    }

    if (stage.type === "viewing-file") {
      if (key.upArrow)
        setStage({
          ...stage,
          scrollOffset: Math.max(0, stage.scrollOffset - 1),
        });
      if (key.downArrow)
        setStage({ ...stage, scrollOffset: stage.scrollOffset + 1 });
      if (key.escape || key.return) {
        // restore done stage — need applied list; grab from current viewing context
        // We store a ref via a small workaround: re-derive from files we already have
        setStage((prev) => {
          if (prev.type !== "viewing-file") return prev;
          // Can't go back to done without the applied list — use process.exit instead
          process.exit(0);
          return prev;
        });
      }
      return;
    }

    if (stage.type === "error") {
      if (key.return || key.escape) process.exit(1);
    }
  });

  // ── picking-provider ───────────────────────────────────────────
  if (stage.type === "picking-provider") {
    return <ProviderPicker onDone={handleProviderDone} />;
  }

  // ── reading-files ──────────────────────────────────────────────
  if (stage.type === "reading-files") {
    return (
      <Box marginTop={1} gap={1}>
        <Text color={ORANGE}>
          <Spinner />
        </Text>
        <Text>Reading codebase...</Text>
      </Box>
    );
  }

  // ── thinking ───────────────────────────────────────────────────
  if (stage.type === "thinking") {
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Box gap={1}>
          <Text color={ORANGE}>
            <Spinner />
          </Text>
          <Text>
            Thinking about: <Text color="cyan">"{userPrompt}"</Text>
          </Text>
        </Box>
        {files.length > 0 && (
          <Box flexDirection="column" marginLeft={2}>
            <Text color="gray">Using {files.length} files as context</Text>
          </Box>
        )}
      </Box>
    );
  }

  // ── preview ────────────────────────────────────────────────────
  if (stage.type === "preview") {
    const { plan, diffLines, scrollOffset } = stage;
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text bold color="cyan">
          {figures.info} Proposed Changes
        </Text>
        <Text color="white">{plan.summary}</Text>
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">{plan.patches.length} file(s) to change:</Text>
          {plan.patches.map((p) => (
            <Text key={p.path} color={p.isNew ? "green" : "yellow"}>
              {"  "}
              {p.isNew ? figures.tick : figures.bullet} {p.path}
              {p.isNew && <Text color="gray"> (new)</Text>}
            </Text>
          ))}
        </Box>
        <DiffViewer
          patches={plan.patches}
          diffs={diffLines}
          scrollOffset={scrollOffset}
        />
        <Text color="gray">↑↓ scroll · enter to apply · esc to cancel</Text>
      </Box>
    );
  }

  // ── applying ───────────────────────────────────────────────────
  if (stage.type === "applying") {
    return (
      <Box marginTop={1} gap={1}>
        <Text color={ORANGE}>
          <Spinner />
        </Text>
        <Text>Applying changes...</Text>
      </Box>
    );
  }

  // ── done ───────────────────────────────────────────────────────
  if (stage.type === "done") {
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text bold color="green">
          {figures.tick} Done
        </Text>
        <Text color="gray">{stage.applied.length} file(s) written</Text>
        {stage.applied.map((f, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box key={f.path} marginLeft={1}>
              <Text color={isSelected ? "cyan" : "green"}>
                {isSelected
                  ? figures.arrowRight
                  : f.isNew
                    ? figures.tick
                    : figures.bullet}{" "}
                {f.path}
                {f.isNew && <Text color="gray"> (new)</Text>}
                {isSelected && <Text color="gray"> · enter to view diff</Text>}
              </Text>
            </Box>
          );
        })}
        <Text color="gray">↑↓ navigate · enter to view diff · esc to exit</Text>
      </Box>
    );
  }

  // ── viewing-file ───────────────────────────────────────────────
  if (stage.type === "viewing-file") {
    const { file, diffLines, scrollOffset } = stage;
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Box gap={1}>
          <Text bold color="cyan">
            {figures.info}
          </Text>
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
        <Text color="gray">↑↓ scroll · esc or enter to exit</Text>
      </Box>
    );
  }

  // ── error ──────────────────────────────────────────────────────
  if (stage.type === "error") {
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text color="red">
          {figures.cross} {stage.message}
        </Text>
        <Text color="gray">enter or esc to exit</Text>
      </Box>
    );
  }

  return null;
};
