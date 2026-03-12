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

  return <PromptRunner repoPath={resolvedPath} userPrompt={prompt} />;
};
