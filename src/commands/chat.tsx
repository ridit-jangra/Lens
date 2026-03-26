import React from "react";
import { Box } from "ink";
import { ChatRunner } from "../components/chat/ChatRunner";

export function ChatCommand({
  path,
  autoForce = false,
}: {
  path: string;
  autoForce?: boolean;
}) {
  return (
    <Box flexDirection="column">
      <ChatRunner repoPath={path} autoForce={autoForce} />
    </Box>
  );
}
