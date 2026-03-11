import React from "react";
import { Box, Text } from "ink";
import figures from "figures";
import { existsSync } from "fs";
import path from "path";
import { ChatRunner } from "../components/chat/ChatRunner";

export const ChatCommand = ({ path: inputPath }: { path: string }) => {
  const resolvedPath = path.resolve(inputPath);

  if (!existsSync(resolvedPath)) {
    return (
      <Box marginTop={1}>
        <Text color="red">
          {figures.cross} Path not found: {resolvedPath}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box gap={2} marginTop={1}>
        <Text bold color="cyan">
          {figures.play} Chat
        </Text>
        <Text color="gray">{resolvedPath}</Text>
      </Box>
      <ChatRunner repoPath={resolvedPath} />
    </Box>
  );
};
