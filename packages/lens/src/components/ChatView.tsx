import React, { useState } from "react";
import { Box, Text } from "ink";
import type { Command } from "@ridit/ink-ui/src/components/CommandPalette";
import { Input, Markdown } from "@ridit/ink-ui";
import {
  addMessage,
  chat,
  createSession,
  getMessages,
  getSystemPrompt,
  loadSession,
  saveSession,
} from "@ridit/lens-core";

const cwd = process.cwd();

const COMMANDS: Command[] = [
  { name: "/init", description: "generate lens.md" },
  { name: "/memory", description: "show what lens knows" },
  { name: "/clear", description: "clear current session" },
];

export function ChatView() {
  const [session, setSession] = useState(() => createSession(cwd));
  const [currentChunk, setCurrentChunk] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Box flexDirection="column">
      {/* Messages */}
      <Box flexDirection="column">
        {session.messages.map((message, i) => (
          <Markdown key={i}>{message.content.toString()}</Markdown>
        ))}
        {isLoading && <Text color="gray">{currentChunk}</Text>}
      </Box>

      {/* Input */}
      <Box>
        <Input
          commands={COMMANDS}
          placeholder={`Ask anything about your codebase...`}
          onSubmit={async (val) => {
            if (!val.trim()) return;
            const updated = addMessage(session, "user", val);
            setSession(updated);
            setIsLoading(true);
            setCurrentChunk("");

            await chat({
              messages: getMessages(updated),
              system: getSystemPrompt(cwd),
              onChunk: (chunk) => setCurrentChunk((prev) => prev + chunk),
              onToolCall: (tool, args) => console.log(`\n⟩ ${tool}`, args),
              onFinish: (text) => {
                setSession((prev) => {
                  const final = addMessage(prev, "assistant", text);
                  saveSession(session);
                  return final;
                });
                setCurrentChunk("");
                setIsLoading(false);
              },
            });
          }}
        />
      </Box>
    </Box>
  );
}
