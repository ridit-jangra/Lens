import React, { useState } from "react";
import { Box, Text, useInput, Static } from "ink";
import { InputBox, ShortcutBar } from "@ridit/ink-ui";
import type { Command } from "@ridit/ink-ui/src/components/CommandPalette";
import {
  addMessage,
  chat,
  createSession,
  getMessages,
  getSystemPrompt,
  saveSession,
} from "@ridit/lens-core";
import { Message } from "./Message";
import { Statusbar } from "./Statusbar";
import { ToolCall } from "./ToolCall";

const cwd = process.cwd();
const MODEL = "groq · llama-4-maverick";

interface ToolCallItem {
  id: string;
  tool: string;
  args: unknown;
  status: "running" | "done";
}

const COMMANDS: Command[] = [
  { name: "/init", description: "generate LENS.md" },
  { name: "/memory", description: "show what lens knows" },
  { name: "/clear", description: "clear current session" },
];

export function ChatView() {
  const [session, setSession] = useState(() => createSession(cwd));
  const [currentChunk, setCurrentChunk] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [inputKey, setInputKey] = useState(0);

  useInput((_, key) => {
    if (key.escape && isLoading) {
      setIsLoading(false);
      setCurrentChunk("");
    }
  });

  const handleSubmit = async (val: string) => {
    if (!val.trim()) return;
    setInputValue("");
    setInputKey((k) => k + 1);
    setToolCalls([]);
    const updated = addMessage(session, "user", val);
    setSession(updated);
    setIsLoading(true);
    setCurrentChunk("");

    await chat({
      messages: getMessages(updated),
      system: getSystemPrompt(cwd),
      onChunk: (chunk) => setCurrentChunk((prev) => prev + chunk),
      onToolCall: (tool, args) => {
        const id = crypto.randomUUID();
        setToolCalls((prev) => [
          ...prev,
          { id, tool, args, status: "running" },
        ]);
        setTimeout(() => {
          setToolCalls((prev) =>
            prev.map((tc) =>
              tc.tool === tool ? { ...tc, status: "done" } : tc,
            ),
          );
        }, 500);
      },
      onFinish: (text) => {
        setSession((prev) => {
          const final = addMessage(prev, "assistant", text);
          saveSession(final);
          return final;
        });
        setCurrentChunk("");
        setIsLoading(false);
        setToolCalls([]);
      },
    });
  };

  return (
    <Box flexDirection="column" marginX={2} marginTop={1}>
      <Statusbar
        model={MODEL}
        isLoading={isLoading}
        sessionId={session.id}
        cwd={cwd}
      />

      {/* Static messages */}
      <Static items={session.messages}>
        {(message, i) => (
          <Message key={i} role={message.role}>
            {message.content as string}
          </Message>
        )}
      </Static>

      {/* Dynamic: tool calls + streaming chunk */}
      <Box flexDirection="column">
        {toolCalls.map((tc) => (
          <ToolCall
            key={tc.id}
            tool={tc.tool}
            args={tc.args}
            status={tc.status}
          />
        ))}
        {isLoading && currentChunk && (
          <Box gap={1} marginLeft={2}>
            <Text color="cyan">●</Text>
            <Text color="gray">{currentChunk}</Text>
          </Box>
        )}
      </Box>

      {/* Input */}
      <InputBox
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        inputKey={inputKey}
        placeholder="Ask anything about your codebase..."
      />
      <ShortcutBar isLoading={isLoading} />
    </Box>
  );
}
