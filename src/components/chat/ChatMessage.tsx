import React from "react";
import { Box, Text } from "ink";
import { ACCENT } from "../../colors";
import type { Message } from "../../types/chat";

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

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <Box flexDirection="column" marginY={1} marginLeft={2}>
      {lang && <Text color="gray">{lang}</Text>}
      {code.split("\n").map((line, i) => (
        <Text key={i} color={ACCENT}>
          {"  "}
          {line}
        </Text>
      ))}
    </Box>
  );
}

function MessageBody({ content }: { content: string }) {
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
        return (
          <Box key={si} flexDirection="column">
            {lines.map((line, li) => {
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

export function StaticMessage({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <Box marginBottom={1} gap={1}>
        <Text color="gray">{">"}</Text>
        <Text color="white" bold>
          {msg.content}
        </Text>
      </Box>
    );
  }

  if (msg.type === "tool") {
    const icons: Record<string, string> = {
      shell: "$",
      fetch: "~>",
      "read-file": "r",
      "read-folder": "d",
      grep: "/",
      "delete-file": "x",
      "delete-folder": "X",
      "open-url": "↗",
      "write-file": "w",
      search: "?",
    };
    const icon = icons[msg.toolName] ?? "·";
    const label =
      msg.toolName === "shell"
        ? msg.content
        : msg.toolName === "search"
          ? `"${msg.content}"`
          : msg.content;

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1}>
          <Text color={msg.approved ? ACCENT : "red"}>{icon}</Text>
          <Text color={msg.approved ? "gray" : "red"} dimColor={!msg.approved}>
            {label}
          </Text>
          {!msg.approved && <Text color="red">denied</Text>}
        </Box>
        {msg.approved && msg.result && (
          <Box marginLeft={2}>
            <Text color="gray">
              {msg.result.split("\n")[0]?.slice(0, 120)}
              {(msg.result.split("\n")[0]?.length ?? 0) > 120 ? "…" : ""}
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  if (msg.type === "plan") {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={1}>
          <Text color={ACCENT}>*</Text>
          <MessageBody content={msg.content} />
        </Box>
        <Box marginLeft={2} gap={1}>
          <Text color={msg.applied ? "green" : "gray"}>
            {msg.applied ? "✓" : "·"}
          </Text>
          <Text color={msg.applied ? "green" : "gray"} dimColor={!msg.applied}>
            {msg.applied ? "changes applied" : "changes skipped"}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box marginBottom={1} gap={1}>
      <Text color={ACCENT}>●</Text>
      <MessageBody content={msg.content} />
    </Box>
  );
}
