import React from "react";
import { Box, Text } from "ink";
import { ACCENT, GREEN, RED } from "../../colors";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UIMessage =
  | { role: "user" | "assistant"; type: "text"; content: string }
  | {
      role: "assistant";
      type: "tool";
      toolName: string;
      content: string;
      result: string;
      approved: boolean;
    };

// ── Tool icons ────────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  bash: "$",
  read: "r",
  write: "w",
  grep: "/",
  ls: "d",
  remember: "·",
};

// ── Inline text renderer ──────────────────────────────────────────────────────

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <Text key={i} color={ACCENT}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <Text key={i} bold color="white">
              {part.slice(2, -2)}
            </Text>
          );
        }
        return (
          <Text key={i} color="white">
            {part}
          </Text>
        );
      })}
    </>
  );
}

// ── Code block ────────────────────────────────────────────────────────────────

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <Box flexDirection="column" marginY={0}>
      {lang ? (
        <Text color="gray" dimColor>
          {"  "}{lang}
        </Text>
      ) : null}
      {code.split("\n").map((line, i) => (
        <Text key={i} color={ACCENT}>
          {"  "}{line}
        </Text>
      ))}
    </Box>
  );
}

// ── Message body (markdown-lite) ──────────────────────────────────────────────

export function MessageBody({ content }: { content: string }) {
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <Box flexDirection="column">
      {segments.map((seg, si) => {
        if (seg.startsWith("```")) {
          const lines = seg.slice(3).split("\n");
          const lang = lines[0]?.trim() ?? "";
          const code = lines
            .slice(1)
            .join("\n")
            .replace(/```\s*$/, "")
            .trimEnd();
          return <CodeBlock key={si} lang={lang} code={code} />;
        }

        const lines = seg.split("\n").filter((l) => l.trim() !== "");
        if (lines.length === 0) return null;
        return (
          <Box key={si} flexDirection="column">
            {lines.map((line, li) => {
              if (line.match(/^#{1,3}\s/)) {
                return (
                  <Box key={li}>
                    <Text bold color={ACCENT}>
                      {line.replace(/^#+\s/, "")}
                    </Text>
                  </Box>
                );
              }
              if (line.match(/^[-*•]\s/)) {
                return (
                  <Box key={li} gap={1}>
                    <Text color={ACCENT}>*</Text>
                    <InlineText text={line.slice(2).trim()} />
                  </Box>
                );
              }
              if (line.match(/^\d+\.\s/)) {
                const num = line.match(/^(\d+)\.\s/)![1];
                return (
                  <Box key={li} gap={1}>
                    <Text color="gray">{num}.</Text>
                    <InlineText text={line.replace(/^\d+\.\s/, "").trim()} />
                  </Box>
                );
              }
              return (
                <Box key={li}>
                  <InlineText text={line} />
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

// ── Static message renderer ───────────────────────────────────────────────────

export function StaticMessage({ msg }: { msg: UIMessage }) {
  if (msg.role === "user") {
    return (
      <Box marginBottom={1} gap={1}>
        <Text color={ACCENT}>{">"}</Text>
        <Text color="white" bold>
          {msg.content}
        </Text>
      </Box>
    );
  }

  if (msg.type === "tool") {
    const icon = TOOL_ICONS[msg.toolName] ?? "·";
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1}>
          <Text color={msg.approved ? ACCENT : RED}>{icon}</Text>
          <Text color={msg.approved ? "gray" : RED} dimColor={!msg.approved}>
            {msg.content}
          </Text>
          {!msg.approved && <Text color={RED}>denied</Text>}
        </Box>
        {msg.approved && msg.result && (
          <Box gap={1} marginLeft={2}>
            <Text color="gray" dimColor>{"└"}</Text>
            <Text color="gray" dimColor>
              {msg.result.split("\n")[0]?.slice(0, 120)}
              {(msg.result.split("\n")[0]?.length ?? 0) > 120 ? "…" : ""}
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  // assistant text
  return (
    <Box marginBottom={1} gap={1}>
      <Text color={ACCENT}>●</Text>
      <MessageBody content={msg.content} />
    </Box>
  );
}
