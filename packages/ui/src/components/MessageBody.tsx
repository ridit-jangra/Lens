import React from "react";
import { Box, Text } from "ink";
import { ACCENT } from "../colors";

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`"))
          return (
            <Text key={i} color={ACCENT}>
              {part.slice(1, -1)}
            </Text>
          );
        if (part.startsWith("**") && part.endsWith("**"))
          return (
            <Text key={i} bold>
              {part.slice(2, -2)}
            </Text>
          );
        return <Text key={i}>{part}</Text>;
      })}
    </>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const lines = code.split("\n");
  return (
    <Box flexDirection="column">
      <Text color={ACCENT} dimColor>
        {"  ╭─"}
        {lang ? ` ${lang}` : ""}
      </Text>
      {lines.map((line, i) => (
        <Box key={i}>
          <Text color={ACCENT} dimColor>
            {"  │ "}
          </Text>
          <Text color="white">{line}</Text>
        </Box>
      ))}
      <Text color={ACCENT} dimColor>
        {"  ╰─"}
      </Text>
    </Box>
  );
}

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
              if (line.match(/^#{1,3}\s/))
                return (
                  <Box key={li}>
                    <Text bold>{line.replace(/^#+\s/, "")}</Text>
                  </Box>
                );
              if (line.match(/^[-*•]\s/))
                return (
                  <Box key={li} gap={1}>
                    <Text color={ACCENT} dimColor>
                      ·
                    </Text>
                    <InlineText text={line.slice(2).trim()} />
                  </Box>
                );
              if (line.match(/^\d+\.\s/)) {
                const num = line.match(/^(\d+)\.\s/)![1];
                return (
                  <Box key={li} gap={1}>
                    <Text color="gray" dimColor>
                      {num}.
                    </Text>
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
