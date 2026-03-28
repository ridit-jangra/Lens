import React from "react";
import { Box } from "ink";
import { ChatRunner } from "../components/chat/ChatView";

export function ChatCommand({
  path,
  autoForce = false,
  initialMessage,
}: {
  path: string;
  autoForce?: boolean;
  initialMessage?: string;
}) {
  return (
    <Box flexDirection="column">
      <ChatRunner repoPath={path} autoForce={autoForce} initialMessage={initialMessage} />
    </Box>
  );
}
