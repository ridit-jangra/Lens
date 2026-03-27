import React from "react";
import { Box, Text } from "ink";

interface DiffProps {
  filename: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  lineNumber?: number;
}

export function Diff({ additions, filename, deletions, lines }: DiffProps) {
  return (
    <Box gap={1} flexDirection="column">
      <Box gap={1}>
        <Text color="white">{filename}</Text>
        <Text color="green">+{additions}</Text>
        <Text color="red">-{deletions}</Text>
      </Box>
      <Box gap={1}>
        <Box flexDirection="column">
          {lines.map((_, i) => (
            <Text key={i}>{i + 1}</Text>
          ))}
        </Box>
        <Box flexDirection="column">
          {lines.map((line, i) => (
            <Text
              key={i}
              color={
                line.type === "add"
                  ? "green"
                  : line.type === "remove"
                    ? "red"
                    : "white"
              }
            >
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : ""}{" "}
              {line.content}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
