import React from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import figures from "figures";
import { useState } from "react";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { ACCENT } from "../../colors";
import { callModelRaw } from "../../utils/ai";
import { DiffViewer, buildDiffs } from "./DiffViewer";
import type { DiffLine, FilePatch } from "./DiffViewer";
import type { Provider } from "../../types/config";
import type { AnalysisResult, ImportantFile } from "../../types/repo";

type FixStage =
  | { type: "picking-issue" }
  | {
      type: "fixing";
      issue: string;
      progress?: { current: number; total: number };
    }
  | {
      type: "preview";
      issue: string;
      plan: FixPlan;
      diffLines: DiffLine[][];
      isFixAll: boolean;
      remainingIssues: FixableIssue[];
      scrollOffset: number;
    }
  | { type: "applying"; issue: string; plan: FixPlan }
  | { type: "done"; applied: AppliedFix[]; remainingIssues: FixableIssue[] }
  | {
      type: "fix-all-summary";
      allApplied: AppliedFix[];
      failed: string[];
      selectedFile: number;
      scrollOffset: number;
    }
  | {
      type: "viewing-file";
      file: AppliedFix;
      diffLines: DiffLine[];
      scrollOffset: number;
      returnTo: "done" | "fix-all-summary";
      doneState?: { applied: AppliedFix[]; remainingIssues: FixableIssue[] };
      summaryState?: { allApplied: AppliedFix[]; failed: string[] };
    }
  | { type: "error"; message: string };

type FixPlan = {
  summary: string;
  patches: FilePatch[];
};

type AppliedFix = {
  path: string;
  isNew: boolean;
  issueLabel: string;
  patch: FilePatch;
};

type FixableIssue = {
  label: string;
  category: "security" | "config" | "suggestion";
};

function buildFixPrompt(
  repoPath: string,
  issue: string,
  requestedFiles: ImportantFile[],
): string {
  const fileList = requestedFiles
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
    .join("\n\n");

  return `You are a senior software engineer. You need to fix the following issue in a codebase:

Issue: ${issue}

Here are the relevant files:

${fileList}

Fix this issue by providing the complete new content for any files that need to be created or modified.

Respond ONLY with a JSON object (no markdown, no explanation) with this exact shape:
{
  "summary": "1-2 sentence explanation of what you changed and why",
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
- Keep changes minimal and focused on the issue
- Do not change unrelated code`;
}

function applyPatches(
  repoPath: string,
  plan: FixPlan,
  issueLabel: string,
): AppliedFix[] {
  const applied: AppliedFix[] = [];
  for (const patch of plan.patches) {
    const fullPath = path.join(repoPath, patch.path);
    const dir = path.dirname(fullPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, patch.content, "utf-8");
    applied.push({ path: patch.path, isNew: patch.isNew, issueLabel, patch });
  }
  return applied;
}

async function runFixAll(
  repoPath: string,
  issues: FixableIssue[],
  requestedFiles: ImportantFile[],
  provider: Provider,
  onProgress: (current: number, total: number, issue: string) => void,
): Promise<{ allApplied: AppliedFix[]; failed: string[] }> {
  const allApplied: AppliedFix[] = [];
  const failed: string[] = [];

  for (let idx = 0; idx < issues.length; idx++) {
    const issue = issues[idx]!;
    onProgress(idx + 1, issues.length, issue.label);
    try {
      const text = await callModelRaw(
        provider,
        buildFixPrompt(repoPath, issue.label, requestedFiles),
      );
      const cleaned = text.replace(/```json|```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON in response");
      const plan = JSON.parse(match[0]) as FixPlan;
      const applied = applyPatches(repoPath, plan, issue.label);
      allApplied.push(...applied);
    } catch {
      failed.push(issue.label);
    }
  }

  return { allApplied, failed };
}

export const IssueFixer = ({
  repoPath,
  result,
  requestedFiles,
  provider,
  onDone,
}: {
  repoPath: string;
  result: AnalysisResult;
  requestedFiles: ImportantFile[];
  provider: Provider;
  onDone: () => void;
}) => {
  const [stage, setStage] = useState<FixStage>({ type: "picking-issue" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fixedLabels, setFixedLabels] = useState<Set<string>>(new Set());

  const allIssues: FixableIssue[] = [
    ...result.securityIssues.map((s) => ({
      label: s,
      category: "security" as const,
    })),
    ...result.missingConfigs.map((s) => ({
      label: s,
      category: "config" as const,
    })),
    ...result.suggestions.map((s) => ({
      label: s,
      category: "suggestion" as const,
    })),
  ];

  const fixableIssues = allIssues.filter((i) => !fixedLabels.has(i.label));

  const markFixed = (labels: string[]) => {
    setFixedLabels((prev) => {
      const next = new Set(prev);
      labels.forEach((l) => next.add(l));
      return next;
    });
  };

  const FIX_ALL_INDEX = 0;
  const totalOptions = fixableIssues.length + 1;

  useInput((_, key) => {
    if (stage.type === "picking-issue") {
      if (key.upArrow) setSelectedIndex((i) => Math.max(0, i - 1));
      if (key.downArrow)
        setSelectedIndex((i) => Math.min(totalOptions - 1, i + 1));
      if (key.escape) {
        onDone();
        return;
      }
      if (key.return) {
        if (selectedIndex === FIX_ALL_INDEX) {
          setStage({
            type: "fixing",
            issue: "all issues",
            progress: { current: 0, total: fixableIssues.length },
          });
          runFixAll(
            repoPath,
            fixableIssues,
            requestedFiles,
            provider,
            (current, total, issue) => {
              setStage({ type: "fixing", issue, progress: { current, total } });
            },
          ).then(({ allApplied, failed }) => {
            const failedSet = new Set(failed);
            markFixed(
              fixableIssues
                .filter((i) => !failedSet.has(i.label))
                .map((i) => i.label),
            );
            setStage({
              type: "fix-all-summary",
              allApplied,
              failed,
              selectedFile: 0,
              scrollOffset: 0,
            });
          });
          return;
        }
        const issue = fixableIssues[selectedIndex - 1];
        if (!issue) return;
        setStage({ type: "fixing", issue: issue.label });
        callModelRaw(
          provider,
          buildFixPrompt(repoPath, issue.label, requestedFiles),
        )
          .then((text: string) => {
            const cleaned = text.replace(/```json|```/g, "").trim();
            const match = cleaned.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("No JSON in response");
            const plan = JSON.parse(match[0]) as FixPlan;
            const diffLines = buildDiffs(repoPath, plan.patches);
            const remaining = fixableIssues.filter(
              (_, i) => i !== selectedIndex - 1,
            );
            setStage({
              type: "preview",
              issue: issue.label,
              plan,
              diffLines,
              isFixAll: false,
              remainingIssues: remaining,
              scrollOffset: 0,
            });
          })
          .catch((err: unknown) =>
            setStage({
              type: "error",
              message: err instanceof Error ? err.message : "Fix failed",
            }),
          );
      }
      return;
    }

    if (stage.type === "preview") {
      if (key.escape) {
        setStage({ type: "picking-issue" });
        return;
      }
      if (key.upArrow)
        setStage({
          ...stage,
          scrollOffset: Math.max(0, stage.scrollOffset - 1),
        });
      if (key.downArrow)
        setStage({ ...stage, scrollOffset: stage.scrollOffset + 1 });
      if (key.return) {
        const { plan, issue, remainingIssues } = stage;
        setStage({ type: "applying", issue, plan });
        try {
          const applied = applyPatches(repoPath, plan, issue);
          markFixed([issue]);
          setSelectedIndex(0);
          setStage({ type: "done", applied, remainingIssues });
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
        onDone();
        return;
      }
      if (key.upArrow) setSelectedIndex((i) => Math.max(0, i - 1));
      if (key.downArrow)
        setSelectedIndex((i) => Math.min(stage.applied.length - 1, i + 1));
      if (key.return) {
        const file = stage.applied[selectedIndex];
        if (!file) return;
        const diffLines = buildDiffs(repoPath, [file.patch])[0] ?? [];
        setStage({
          type: "viewing-file",
          file,
          diffLines,
          scrollOffset: 0,
          returnTo: "done",
          doneState: {
            applied: stage.applied,
            remainingIssues: stage.remainingIssues,
          },
        });
      }
      return;
    }

    if (stage.type === "fix-all-summary") {
      if (key.escape) {
        onDone();
        return;
      }
      if (key.upArrow)
        setStage({
          ...stage,
          selectedFile: Math.max(0, stage.selectedFile - 1),
        });
      if (key.downArrow)
        setStage({
          ...stage,
          selectedFile: Math.min(
            stage.allApplied.length - 1,
            stage.selectedFile + 1,
          ),
        });
      if (key.return) {
        const file = stage.allApplied[stage.selectedFile];
        if (!file) return;
        const diffLines = buildDiffs(repoPath, [file.patch])[0] ?? [];
        setStage({
          type: "viewing-file",
          file,
          diffLines,
          scrollOffset: 0,
          returnTo: "fix-all-summary",
          summaryState: { allApplied: stage.allApplied, failed: stage.failed },
        });
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
        if (stage.returnTo === "done" && stage.doneState) {
          setStage({ type: "done", ...stage.doneState });
          setSelectedIndex(0);
        } else if (stage.returnTo === "fix-all-summary" && stage.summaryState) {
          setStage({
            type: "fix-all-summary",
            ...stage.summaryState,
            selectedFile: 0,
            scrollOffset: 0,
          });
        }
      }
      return;
    }

    if (stage.type === "error") {
      if (key.return || key.escape) onDone();
    }
  });

  if (stage.type === "picking-issue") {
    const allDone = fixableIssues.length === 0;
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Box gap={2}>
          <Text bold color="cyan">
            ⚙ Issues
          </Text>
          {fixedLabels.size > 0 && (
            <Text color="gray">
              {figures.tick} {fixedLabels.size} fixed
              {allDone
                ? " · all done!"
                : ` · ${fixableIssues.length} remaining`}
            </Text>
          )}
        </Box>
        {allIssues
          .filter((i) => fixedLabels.has(i.label))
          .map((issue, i) => (
            <Box key={`fixed-${i}`} marginLeft={1}>
              <Text color="gray">
                {figures.tick}
                {"  "}
                {issue.label}
              </Text>
            </Box>
          ))}
        {allDone ? (
          <>
            <Text color="green">{figures.tick} All issues fixed!</Text>
            <Text color="gray">esc to go back</Text>
          </>
        ) : (
          <>
            <Box marginLeft={1}>
              <Text color={selectedIndex === FIX_ALL_INDEX ? "cyan" : "white"}>
                {selectedIndex === FIX_ALL_INDEX ? figures.arrowRight : " "}
                {"  "}
                <Text bold>Fix all remaining</Text>
                <Text color="gray">
                  {" "}
                  {fixableIssues.length} issues · no preview
                </Text>
              </Text>
            </Box>
            {fixableIssues.map((issue, i) => {
              const isSelected = i + 1 === selectedIndex;
              const color =
                issue.category === "security"
                  ? "red"
                  : issue.category === "config"
                    ? "yellow"
                    : "white";
              return (
                <Box key={i} marginLeft={1}>
                  <Text color={isSelected ? "cyan" : color}>
                    {isSelected ? figures.arrowRight : " "}
                    {"  "}
                    {issue.label}
                  </Text>
                </Box>
              );
            })}
            <Text color="gray">
              ↑↓ navigate · enter to fix · esc to go back
            </Text>
          </>
        )}
      </Box>
    );
  }

  if (stage.type === "fixing") {
    const { progress } = stage;
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Box>
          <Text color={ACCENT}>
            <Spinner />
          </Text>
          <Box marginLeft={1}>
            {progress ? (
              <Text>
                [{progress.current}/{progress.total}] Fixing:{" "}
                <Text color="cyan">{stage.issue}</Text>
              </Text>
            ) : (
              <Text>
                Generating fix for: <Text color="cyan">{stage.issue}</Text>
              </Text>
            )}
          </Box>
        </Box>
        {progress && (
          <Box marginLeft={2}>
            <Text color="gray">
              {"█".repeat(progress.current)}
              {"░".repeat(progress.total - progress.current)}{" "}
              {Math.round((progress.current / progress.total) * 100)}%
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  if (stage.type === "preview") {
    const { plan, diffLines, scrollOffset } = stage;
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text bold color="cyan">
          {figures.info} Fix Preview
        </Text>
        <Text color="white">{plan.summary}</Text>
        <Box flexDirection="column" marginTop={1}>
          <DiffViewer
            patches={plan.patches}
            diffs={diffLines}
            scrollOffset={scrollOffset}
          />
        </Box>
        <Text color="gray">↑↓ scroll · enter to apply · esc to go back</Text>
      </Box>
    );
  }

  if (stage.type === "applying") {
    return (
      <Box marginTop={1}>
        <Text color={ACCENT}>
          <Spinner />
        </Text>
        <Box marginLeft={1}>
          <Text>Applying fixes...</Text>
        </Box>
      </Box>
    );
  }

  if (stage.type === "done") {
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text bold color="green">
          {figures.tick} Fix applied
        </Text>
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
                {isSelected && <Text color="gray"> · enter to view diff</Text>}
              </Text>
            </Box>
          );
        })}
        {stage.remainingIssues.length > 0 && (
          <Text color="gray">
            {figures.info} {stage.remainingIssues.length} issue(s) remaining ·
            esc to go back to list
          </Text>
        )}
        <Text color="gray">
          ↑↓ navigate · enter to view diff · esc to go back
        </Text>
      </Box>
    );
  }

  if (stage.type === "fix-all-summary") {
    const { allApplied, failed, selectedFile } = stage;
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text bold color="green">
          {figures.tick} Fix all complete
        </Text>
        <Text color="gray">
          {allApplied.length} file(s) written · {failed.length} issue(s) failed
        </Text>
        {allApplied.length > 0 && (
          <Box flexDirection="column" gap={0}>
            <Text color="gray">Applied:</Text>
            {allApplied.map((f, i) => {
              const isSelected = i === selectedFile;
              return (
                <Box key={i} marginLeft={1}>
                  <Text color={isSelected ? "cyan" : "green"}>
                    {isSelected
                      ? figures.arrowRight
                      : f.isNew
                        ? figures.tick
                        : figures.bullet}{" "}
                    {f.path}
                    <Text color="gray">
                      {isSelected
                        ? " · enter to view diff"
                        : ` ← ${f.issueLabel.slice(0, 40)}${f.issueLabel.length > 40 ? "…" : ""}`}
                    </Text>
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}
        {failed.length > 0 && (
          <Box flexDirection="column" gap={0}>
            <Text color="red">Failed:</Text>
            {failed.map((label, i) => (
              <Box key={i} marginLeft={1}>
                <Text color="red">
                  {figures.cross} {label}
                </Text>
              </Box>
            ))}
          </Box>
        )}
        <Text color="gray">
          ↑↓ navigate · enter to view diff · esc to go back
        </Text>
      </Box>
    );
  }

  if (stage.type === "viewing-file") {
    const { file, diffLines, scrollOffset: viewScroll } = stage;
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
        <Text color="gray" dimColor>
          {file.issueLabel.slice(0, 80)}
          {file.issueLabel.length > 80 ? "…" : ""}
        </Text>
        <DiffViewer
          patches={[file.patch]}
          diffs={[diffLines]}
          scrollOffset={viewScroll}
        />
        <Text color="gray">↑↓ scroll · esc or enter to go back</Text>
      </Box>
    );
  }

  if (stage.type === "error") {
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text color="red">
          {figures.cross} {stage.message}
        </Text>
        <Text color="gray">enter or esc to go back</Text>
      </Box>
    );
  }

  return null;
};
