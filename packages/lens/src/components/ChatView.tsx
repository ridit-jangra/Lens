import React, { useState } from "react";
import { Box, Text, useInput, Static } from "ink";
import { InputBox, ShortcutBar, ACCENT, GREEN } from "@ridit/ink-ui";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  addMessage,
  chat,
  createSession,
  getMessages,
  getSystemPrompt,
  saveSession,
} from "@ridit/lens-core";
import { Message, extractText } from "./Message";
import { ToolCall } from "./ToolCall";

const cwd = process.cwd();
const hasLensMd = existsSync(join(cwd, "LENS.md"));

interface ToolCallItem {
  id: string;
  tool: string;
  args: unknown;
  status: "running" | "done";
}

interface Turn {
  id: string;
  userText: string;
  toolCalls: ToolCallItem[];
  assistantText: string;
}

function buildTurnsFromSession(
  messages: Array<{ role: string; content: unknown }>,
): Turn[] {
  const turns: Turn[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    if (msg.role !== "user") continue;
    const next = messages[i + 1];
    if (next?.role === "assistant") {
      turns.push({
        id: crypto.randomUUID(),
        userText: extractText(msg.content),
        toolCalls: [],
        assistantText: extractText(next.content),
      });
      i++;
    }
  }
  return turns;
}

export function ChatView() {
  const [session, setSession] = useState(() => createSession(cwd));
  const [turns, setTurns] = useState<Turn[]>(() =>
    buildTurnsFromSession(
      createSession(cwd).messages.filter(
        (m) => m.role === "user" || m.role === "assistant",
      ),
    ),
  );
  const [currentChunk, setCurrentChunk] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [liveToolCalls, setLiveToolCalls] = useState<ToolCallItem[]>([]);
  const [currentUserText, setCurrentUserText] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [inputKey, setInputKey] = useState(0);

  useInput((_, key) => {
    if (key.escape && isLoading) {
      setIsLoading(false);
      setCurrentChunk("");
      setLiveToolCalls([]);
      setCurrentUserText("");
    }
  });

  const handleSubmit = async (val: string) => {
    if (!val.trim() || isLoading) return;

    setInputValue("");
    setInputKey((k) => k + 1);
    setLiveToolCalls([]);
    setCurrentUserText(val);

    const updated = addMessage(session, "user", val);
    setSession(updated);
    setIsLoading(true);
    setCurrentChunk("");

    const turnId = crypto.randomUUID();
    const turnToolCalls: ToolCallItem[] = [];

    await chat({
      messages: getMessages(updated),
      system: getSystemPrompt(cwd),
      onChunk: (chunk) => setCurrentChunk((prev) => prev + chunk),
      onToolCall: (tool, args) => {
        // For full-content writes, capture the existing file so we can show removals
        let enrichedArgs = args;
        const WRITE_TOOLS = new Set(["write_file", "write", "create_file", "create", "overwrite_file"]);
        if (WRITE_TOOLS.has(tool) && typeof args === "object" && args) {
          const a = args as Record<string, unknown>;
          const filePath = String(a.path ?? a.file_path ?? a.filename ?? "");
          if (filePath) {
            const abs = join(cwd, filePath);
            try {
              enrichedArgs = { ...a, _prevContent: readFileSync(abs, "utf-8") };
            } catch { /* file doesn't exist yet */ }
          }
        }

        const id = crypto.randomUUID();
        const item: ToolCallItem = { id, tool, args: enrichedArgs, status: "running" };
        turnToolCalls.push(item);
        setLiveToolCalls((prev) => [...prev, item]);
        setTimeout(() => {
          const idx = turnToolCalls.findIndex((tc) => tc.id === id);
          if (idx !== -1)
            turnToolCalls[idx] = { ...turnToolCalls[idx]!, status: "done" };
          setLiveToolCalls((prev) =>
            prev.map((tc) => (tc.id === id ? { ...tc, status: "done" } : tc)),
          );
        }, 500);
      },
      onFinish: (text) => {
        setSession((prev) => {
          const final = addMessage(prev, "assistant", text);
          saveSession(final);
          return final;
        });
        setTurns((prev) => [
          ...prev,
          {
            id: turnId,
            userText: val,
            toolCalls: turnToolCalls.map((tc) => ({ ...tc, status: "done" })),
            assistantText: text,
          },
        ]);
        setCurrentUserText("");
        setCurrentChunk("");
        setIsLoading(false);
        setLiveToolCalls([]);
      },
    });
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Status hints */}
      {hasLensMd && (
        <Box gap={1} marginBottom={1} paddingLeft={1}>
          <Text color={GREEN} dimColor>✓</Text>
          <Text color="gray" dimColor>LENS.md loaded</Text>
        </Box>
      )}

      {/* Completed turns — frozen by Static */}
      <Static items={turns}>
        {(turn) => (
          <Box key={turn.id} flexDirection="column" marginBottom={1}>
            <Message role="user">{turn.userText}</Message>
            {turn.toolCalls.length > 0 && (
              <Box flexDirection="column">
                {turn.toolCalls.map((tc) => (
                  <ToolCall
                    key={tc.id}
                    tool={tc.tool}
                    args={tc.args}
                    status="done"
                  />
                ))}
              </Box>
            )}
            <Message role="assistant">{turn.assistantText}</Message>
          </Box>
        )}
      </Static>

      {/* In-progress turn */}
      {isLoading && (
        <Box flexDirection="column">
          <Message role="user">{currentUserText}</Message>
          {liveToolCalls.length > 0 && (
            <Box flexDirection="column">
              {liveToolCalls.map((tc) => (
                <ToolCall
                  key={tc.id}
                  tool={tc.tool}
                  args={tc.args}
                  status={tc.status}
                />
              ))}
            </Box>
          )}
          {currentChunk ? (
            <Message role="assistant">{currentChunk}</Message>
          ) : (
            <Box gap={1} paddingLeft={1}>
              <Text color={ACCENT} dimColor>◆</Text>
              <Text color="gray" dimColor>thinking...</Text>
            </Box>
          )}
        </Box>
      )}

      <InputBox
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        inputKey={inputKey}
        placeholder="Ask anything about your codebase..."
        disabled={isLoading}
      />
      <ShortcutBar />
    </Box>
  );
}
