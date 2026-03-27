// ToolCall.tsx
import React from "react";
import { Box, Text } from "ink";

interface ToolCallProps {
  tool: string;
  args: unknown;
  status: "running" | "done";
  tokenCount?: number;
  duration?: number;
}

export function ToolCall({
  tool,
  args,
  status,
  tokenCount,
  duration,
}: ToolCallProps) {
  const argStr =
    typeof args === "object"
      ? Object.values(args as object)
          .join(", ")
          .slice(0, 40)
      : String(args);

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box gap={1}>
        <Text color={status === "done" ? "green" : "yellow"}>●</Text>
        <Text color="gray">
          {tool}({argStr})
        </Text>
      </Box>
      {status === "done" && (
        <Box marginLeft={2}>
          <Text color="gray">
            └ Done{tokenCount ? ` · ${tokenCount} tokens` : ""}
            {duration ? ` · ${duration}s` : ""}
          </Text>
        </Box>
      )}
    </Box>
  );
}
