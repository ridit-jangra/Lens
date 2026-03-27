import React from "react";
import { Box, Text } from "ink";
import { MessageBody } from "@ridit/ink-ui";

const ACCENT = "cyan";

interface MessageProps {
  role: "user" | "assistant" | "tool" | "system";
  children: string;
}

export function Message({ children, role }: MessageProps) {
  if (role === "user") {
    return (
      <Box marginBottom={1} gap={1} paddingLeft={1}>
        <Text color="gray">{">"}</Text>
        <Text color="white" bold>
          {children}
        </Text>
      </Box>
    );
  }
  return (
    <Box marginBottom={1} gap={1}>
      <Text color={ACCENT}>●</Text>
      <MessageBody content={children} />
    </Box>
  );
}
