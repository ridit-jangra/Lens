import React from "react";
import { Box, Text } from "ink";
import { GREEN, YELLOW, RED } from "@ridit/ink-ui";
import {
  FILE_WRITE_TOOLS,
  FILE_READ_TOOLS,
  extractFileDiff,
  getArgDetail,
  getLabel,
} from "./toolcall-utils";

interface ToolCallProps {
  tool: string;
  args: unknown;
  status: "running" | "done";
  tokenCount?: number;
  duration?: number;
}

export function ToolCall({ tool, args, status, tokenCount }: ToolCallProps) {
  const isFileTool = FILE_WRITE_TOOLS.has(tool) || FILE_READ_TOOLS.has(tool);
  const diff = isFileTool ? extractFileDiff(tool, args) : null;
  const detail = getArgDetail(tool, args);
  const isRunning = status === "running";
  const label = getLabel(tool, isRunning);

  const hasDiffContent = diff && (diff.additions.length > 0 || diff.removals.length > 0);

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box gap={1}>
        <Text color={isRunning ? YELLOW : GREEN} dimColor={!isRunning}>
          {isRunning ? "◆" : "✓"}
        </Text>
        <Text color={isRunning ? "white" : "gray"} dimColor={!isRunning}>
          {label}
        </Text>
        {detail && (
          <Text color="gray" dimColor>
            {detail}
            {isRunning ? "..." : ""}
          </Text>
        )}
        {!isRunning && tokenCount && (
          <Text color="gray" dimColor>· {tokenCount} tokens</Text>
        )}
      </Box>

      {hasDiffContent && (
        <Box flexDirection="column" marginLeft={4}>
          {diff!.removals.map((line, i) => (
            <Text key={`r${i}`} color={RED} dimColor>
              {"- "}
              {line}
            </Text>
          ))}
          {diff!.additions.map((line, i) => (
            <Text key={`a${i}`} color={GREEN} dimColor>
              {"+ "}
              {line}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
