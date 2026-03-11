import React from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import { useState } from "react";
import type { LensFile } from "../../utils/lensfile";

type MenuOption =
  | { id: "use-cached"; label: string; description: string }
  | { id: "re-analyze"; label: string; description: string }
  | { id: "fix-issues"; label: string; description: string }
  | { id: "security"; label: string; description: string }
  | { id: "preview"; label: string; description: string };

export type LensMenuChoice =
  | "use-cached"
  | "re-analyze"
  | "fix-issues"
  | "security"
  | "preview";

const buildOptions = (lf: LensFile): MenuOption[] => {
  const opts: MenuOption[] = [
    {
      id: "use-cached",
      label: "View existing analysis",
      description: "Show the saved summary",
    },
    {
      id: "re-analyze",
      label: "Re-analyze",
      description: "Run a fresh AI analysis",
    },
  ];
  if (lf.suggestions.length > 0 || lf.missingConfigs.length > 0) {
    opts.push({
      id: "fix-issues",
      label: "Fix issues",
      description: `${lf.suggestions.length + lf.missingConfigs.length} issues found`,
    });
  }
  if (lf.securityIssues.length > 0) {
    opts.push({
      id: "security",
      label: "Review security issues",
      description: `${lf.securityIssues.length} issue(s) found`,
    });
  }
  opts.push({
    id: "preview",
    label: "Preview repo",
    description: "Install deps and run dev server",
  });
  return opts;
};

export const LensFileMenu = ({
  repoPath,
  lensFile,
  onChoice,
}: {
  repoPath: string;
  lensFile: LensFile;
  onChoice: (choice: LensMenuChoice) => void;
}) => {
  const [index, setIndex] = useState(0);
  const options = buildOptions(lensFile);

  useInput((_, key) => {
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(options.length - 1, i + 1));
    if (key.return) onChoice(options[index]!.id as LensMenuChoice);
  });

  const age = (() => {
    try {
      const ms = Date.now() - new Date(lensFile.generatedAt).getTime();
      const mins = Math.floor(ms / 60000);
      const hours = Math.floor(mins / 60);
      const days = Math.floor(hours / 24);
      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (mins > 0) return `${mins}m ago`;
      return "just now";
    } catch {
      return "unknown";
    }
  })();

  return (
    <Box flexDirection="column" marginTop={1} gap={1}>
      <Box gap={2}>
        <Text bold color="cyan">
          {figures.info} LENS.md found
        </Text>
        <Text color="gray">analyzed {age}</Text>
      </Box>
      <Text color="gray" dimColor>
        {lensFile.overview.slice(0, 100)}
        {lensFile.overview.length > 100 ? "…" : ""}
      </Text>
      <Box flexDirection="column" gap={0}>
        {options.map((opt, i) => {
          const isSelected = i === index;
          return (
            <Box key={opt.id} marginLeft={1}>
              <Text color={isSelected ? "cyan" : "white"}>
                {isSelected ? figures.arrowRight : " "}
                {"  "}
                <Text bold={isSelected}>{opt.label}</Text>
                <Text color="gray">
                  {"  "}
                  {opt.description}
                </Text>
              </Text>
            </Box>
          );
        })}
      </Box>
      <Text color="gray">↑↓ navigate · enter to select</Text>
    </Box>
  );
};
