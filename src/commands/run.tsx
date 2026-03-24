import React from "react";
import { Box, Text } from "ink";
import figures from "figures";
import path from "path";
import { existsSync } from "fs";
import { RunRunner } from "../components/watch/RunRunner";
import { RED } from "../colors";

interface Props {
  cmd: string;
  path: string;
  clean: boolean;
  fixAll: boolean;
  autoRestart: boolean;
  prompt?: string;
}

export function RunCommand({
  cmd,
  path: inputPath,
  clean,
  fixAll,
  autoRestart,
  prompt,
}: Props) {
  const repoPath = path.resolve(inputPath);

  if (!cmd.trim()) {
    return (
      <Box marginTop={1}>
        <Text color={RED}>{figures.cross} Usage: lens watch "bun dev"</Text>
      </Box>
    );
  }

  if (!existsSync(repoPath)) {
    return (
      <Box marginTop={1}>
        <Text color={RED}>
          {figures.cross} Path not found: {repoPath}
        </Text>
      </Box>
    );
  }

  return (
    <RunRunner
      cmd={cmd}
      repoPath={repoPath}
      clean={clean}
      fixAll={fixAll}
      autoRestart={autoRestart}
      extraPrompt={prompt}
    />
  );
}
