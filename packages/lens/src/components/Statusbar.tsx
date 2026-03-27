// Statusbar.tsx
import React from "react";
import { Box, Text } from "ink";
import { basename } from "path";

interface StatusBarProps {
  model?: string;
  sessionId?: string;
  isLoading?: boolean;
  cwd?: string;
}

export function Statusbar({
  isLoading,
  model,
  sessionId,
  cwd,
}: StatusBarProps) {
  return (
    <Box gap={1} marginBottom={1}>
      <Text color="green">●</Text>
      <Text color="white" bold>
        lens
      </Text>
      <Text color="gray">·</Text>
      <Text color="gray">{model ?? "unknown"}</Text>
      <Text color="gray">·</Text>
      <Text color="gray">{cwd ? `~/${basename(cwd)}` : "unknown"}</Text>
      <Text color="gray">·</Text>
      <Text color="gray">session: {sessionId?.slice(0, 8)}</Text>
      {isLoading && (
        <>
          <Text color="gray">·</Text>
          <Text color="yellow">thinking... (esc to interrupt)</Text>
        </>
      )}
    </Box>
  );
}
