import React from "react";
import { Box } from "ink";
import { ChatRunner } from "../components/chat/ChatView";

export function ChatCommand({
  path,
  autoForce = false,
  initialMessage,
  dev = false,
  single = false,
  sessionId,
}: {
  path: string;
  autoForce?: boolean;
  initialMessage?: string;
  dev?: boolean;
  single?: boolean;
  sessionId?: string;
}) {
  return (
    <Box flexDirection="column">
      <ChatRunner
        repoPath={path}
        autoForce={autoForce}
        initialMessage={initialMessage}
        dev={dev}
        single={single}
        sessionId={sessionId}
      />
    </Box>
  );
}
