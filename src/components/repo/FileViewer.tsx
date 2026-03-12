import React from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import { iconForFile } from "../../utils/files";
import type { ImportantFile } from "../../types/repo";

export const FileViewer = ({
  file,
  index,
  total,
  onBack,
}: {
  file: ImportantFile;
  index: number;
  total: number;
  onBack: () => void;
}) => {
  useInput((_, key) => {
    if (key.backspace || key.delete || key.leftArrow) onBack();
  });

  const lines = file.content.split("\n");

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" paddingX={1}>
        {lines.map((line, i) => (
          <Text key={i} color="white">
            {line}
          </Text>
        ))}
      </Box>

      <Box
        marginTop={1}
        paddingX={1}
        borderStyle="single"
        borderColor="gray"
        justifyContent="space-between"
      >
        <Text color="cyan">
          {iconForFile(file.path)}
          {"  "}
          {file.path}
        </Text>
        <Text color="gray">
          {"  "}
          {lines.length} lines{"  "}
          {figures.bullet}
          {"  "}
          {index + 1}/{total}
          {"  "}
          {figures.bullet}
          {"  "}
          {figures.arrowLeft} back
        </Text>
      </Box>
    </Box>
  );
};
