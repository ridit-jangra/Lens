import React from "react";
import { Box, Text } from "ink";
import figures from "figures";
import { existsSync } from "fs";
import path from "path";
import { PromptRunner } from "../components/task/TaskRunner";

export const TaskCommand = ({
  prompt,
  path: inputPath,
}: {
  prompt: string;
  path: string;
}) => {
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

  if (!prompt.trim()) {
    return (
      <Box marginTop={1}>
        <Text color="red">{figures.cross} Prompt cannot be empty.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box gap={2} marginTop={1}>
        <Text bold color="cyan">
          {figures.play} Prompt
        </Text>
        <Text color="gray">"{prompt}"</Text>
      </Box>
      <PromptRunner repoPath={resolvedPath} userPrompt={prompt} />
    </Box>
  );
};
