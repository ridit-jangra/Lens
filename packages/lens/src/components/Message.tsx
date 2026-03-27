import React from "react";
import { Box, Text } from "ink";
import { MessageBody, ACCENT } from "@ridit/ink-ui";

interface MessageProps {
  role: "user" | "assistant" | "tool" | "system";
  children: unknown;
}

export function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c?.type === "text")
      .map((c) => c.text ?? "")
      .join("");
  }
  return "";
}

export function Message({ children, role }: MessageProps) {
  const text = extractText(children);
  if (!text) return null;

  if (role === "user") {
    return (
      <Box gap={1} paddingLeft={1}>
        <Text color="gray" dimColor>
          you
        </Text>
        <Text color="white">{text}</Text>
      </Box>
    );
  }

  if (role === "assistant") {
    return (
      <Box gap={1}>
        <Text color={ACCENT}>◆</Text>
        <MessageBody content={text} />
      </Box>
    );
  }

  return null;
}
