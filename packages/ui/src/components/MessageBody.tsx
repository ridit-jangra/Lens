import React from "react";
import { Box, Text } from "ink";

const ACCENT = "cyan";

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
            <Text key={i} bold color="white">
              {part.slice(2, -2)}
            </Text>
          );
        return (
          <Text key={i} color="white">
            {part}
          </Text>
        );
      })}
    </>
  );
}

function CodeBlock({ code }: { lang: string; code: string }) {
  return (
    <Box flexDirection="column">
      {code.split("\n").map((line, i) => (
        <Text key={i} color={ACCENT}>
          {"  "}
          {line}
        </Text>
      ))}
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
        return (
          <Box key={si} flexDirection="column">
            {lines.map((line, li) => {
              if (line.match(/^#{1,3}\s/))
                return (
                  <Box key={li}>
                    <Text bold color="white">
                      {line.replace(/^#+\s/, "")}
                    </Text>
                  </Box>
                );
              if (line.match(/^[-*•]\s/))
                return (
                  <Box key={li} gap={1}>
                    <Text color={ACCENT}>*</Text>
                    <InlineText text={line.slice(2).trim()} />
                  </Box>
                );
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
