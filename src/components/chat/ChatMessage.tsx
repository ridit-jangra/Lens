import React from "react";
import { Box, Text } from "ink";
import figures from "figures";
import { ORANGE } from "../../colors";
import type { Message } from "../../types/chat";

export function StaticMessage({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          you{"  "}
        </Text>
        <Text color="white">{msg.content}</Text>
      </Box>
    );
  }

  if (msg.type === "tool") {
    const icon = msg.toolName === "shell" ? "$" : "↗";
    const label =
      msg.toolName === "shell" ? msg.content : msg.content || msg.toolName;
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1}>
          <Text color="magenta" bold>
            {icon}
          </Text>
          <Text color="magenta">{label}</Text>
          {!msg.approved && <Text color="red">(denied)</Text>}
        </Box>
        {msg.approved && (
          <Box marginLeft={2}>
            <Text color="gray" dimColor>
              {msg.result.slice(0, 200)}
              {msg.result.length > 200 ? "…" : ""}
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  if (msg.type === "plan") {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color={ORANGE} bold>
            lens{"  "}
          </Text>
          <Text color="white">{msg.content}</Text>
        </Box>
        <Box marginLeft={6} gap={1}>
          <Text color={msg.applied ? "green" : "yellow"}>
            {msg.applied ? figures.tick : figures.bullet}
          </Text>
          <Text color={msg.applied ? "green" : "yellow"}>
            {msg.applied ? "Changes applied" : "Changes skipped"}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box marginBottom={1}>
      <Text color={ORANGE} bold>
        lens{"  "}
      </Text>
      <Text color="white">{msg.content}</Text>
    </Box>
  );
}
