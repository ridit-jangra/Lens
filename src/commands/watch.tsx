import React from "react";
import { Box, Text } from "ink";
import figures from "figures";
import path from "path";
import { existsSync } from "fs";
import { WatchRunner } from "../components/watch/WatchRunner";
import { RED } from "../colors";

interface Props {
  cmd: string;
  path: string;
  clean: boolean;
  fixAll: boolean;
}

export function WatchCommand({ cmd, path: inputPath, clean, fixAll }: Props) {
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
    <WatchRunner cmd={cmd} repoPath={repoPath} clean={clean} fixAll={fixAll} />
  );
}
