import React, { useState } from "react";
import { Box, Text, Static } from "ink";
import TextInput from "ink-text-input";
import type { Commit } from "../../utils/git";
import { summarizeTimeline } from "../../utils/git";
import type { Provider } from "../../types/config";
import { callChat } from "../../utils/chat";

const ACCENT = "#FF8C00";

type TLMessage = { role: "user" | "assistant"; content: string; type: "text" };

type StaticMsg =
  | { kind: "user"; content: string; id: number }
  | { kind: "assistant"; content: string; id: number };

type Props = {
  commits: Commit[];
  repoPath: string;
  provider: Provider | null;
  onExit: () => void;
  width: number;
  height: number;
};

const SUGGESTIONS = [
  "which commit changed the most files?",
  "who made the most commits?",
  "what happened last week?",
  "show me all merge commits",
  "which day had the most activity?",
];

let msgId = 0;

export function TimelineChat({
  commits,
  provider,
  onExit,
  width,
  height,
}: Props) {
  const [committed, setCommitted] = useState<StaticMsg[]>([]);
  const [live, setLive] = useState<TLMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  const divider = "─".repeat(Math.max(0, width - 2));

  const systemPrompt = `You are a git history analyst. You have access to the full commit timeline of a repository.
Answer questions about the git history concisely and accurately.
Use only the data provided — never make up commits or dates.
Keep answers short. Plain text only, no markdown headers.

${summarizeTimeline(commits)}`;

  const sendMessage = async (text: string) => {
    if (!text.trim() || thinking || !provider) return;

    const userTL: TLMessage = { role: "user", content: text, type: "text" };
    const nextLive = [...live, userTL];

    setCommitted((prev) => [
      ...prev,
      { kind: "user", content: text, id: ++msgId },
    ]);
    setLive(nextLive);
    setThinking(true);
    setInput("");

    try {
      const raw = await callChat(provider, systemPrompt, nextLive as any);
      const answer = typeof raw === "string" ? raw : "(no response)";
      const assistantTL: TLMessage = {
        role: "assistant",
        content: answer,
        type: "text",
      };
      setLive((prev) => [...prev, assistantTL]);
      setCommitted((prev) => [
        ...prev,
        { kind: "assistant", content: answer, id: ++msgId },
      ]);
    } catch (e) {
      const errText = `Error: ${e instanceof Error ? e.message : String(e)}`;
      setCommitted((prev) => [
        ...prev,
        { kind: "assistant", content: errText, id: ++msgId },
      ]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <Box width={width} flexDirection="column">
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          {divider}
        </Text>
      </Box>
      <Box paddingX={1} marginBottom={1} gap={2}>
        <Text color={ACCENT} bold>
          ASK TIMELINE
        </Text>
        <Text color="gray" dimColor>
          tab · esc to go back
        </Text>
      </Box>

      <Static items={committed}>
        {(msg) => (
          <Box key={msg.id} paddingX={1} marginBottom={1} gap={1}>
            <Text color={msg.kind === "user" ? "gray" : ACCENT}>
              {msg.kind === "user" ? ">" : "*"}
            </Text>
            <Text color="white" wrap="wrap">
              {msg.content}
            </Text>
          </Box>
        )}
      </Static>

      {thinking && (
        <Box paddingX={1} marginBottom={1} gap={1}>
          <Text color={ACCENT}>*</Text>
          <Text color="gray" dimColor>
            thinking…
          </Text>
        </Box>
      )}

      {committed.length === 0 && !thinking && (
        <Box paddingX={1} flexDirection="column" marginBottom={1}>
          <Text color="gray" dimColor>
            try asking:
          </Text>
          {SUGGESTIONS.map((s, i) => (
            <Text key={i} color="gray" dimColor>
              {" "}
              {s}
            </Text>
          ))}
        </Box>
      )}

      <Box paddingX={1}>
        <Text color="gray" dimColor>
          {divider}
        </Text>
      </Box>
      <Box paddingX={1} paddingY={1} gap={1}>
        <Text color={ACCENT}>{">"}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={sendMessage}
          placeholder={
            provider
              ? "ask about the timeline…"
              : "no provider — run lens provider first"
          }
        />
      </Box>
    </Box>
  );
}
