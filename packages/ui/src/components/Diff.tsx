import React from "react";
import { Box, Text } from "ink";
import { GREEN, RED } from "../colors";

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
        <Text color={GREEN} dimColor>
          +{additions}
        </Text>
        <Text color={RED} dimColor>
          -{deletions}
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={1}>
        {lines.map((line, i) => (
          <Text
            key={i}
            color={
              line.type === "add"
                ? GREEN
                : line.type === "remove"
                  ? RED
                  : "gray"
            }
            dimColor={line.type === "context"}
          >
            {line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}
            {line.content}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
