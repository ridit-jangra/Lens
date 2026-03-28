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

function TableView({ rows }: { rows: string[][] }) {
  const colCount = Math.max(...rows.map((r) => r.length));
  const colWidths = Array.from({ length: colCount }, (_, ci) =>
    Math.max(...rows.map((r) => (r[ci] ?? "").length), 1),
  );
  return (
    <Box flexDirection="column">
      {rows.map((row, ri) => (
        <Box key={ri}>
          {Array.from({ length: colCount }, (_, ci) => {
            const cell = (row[ci] ?? "").padEnd(colWidths[ci]!);
            return (
              <Text key={ci} color={ri === 0 ? "white" : "gray"} bold={ri === 0}>
                {ci > 0 ? "  " : ""}{cell}
              </Text>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

type Block =
  | { type: "line"; line: string }
  | { type: "table"; rows: string[][] };

function groupLines(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let tableBuffer: string[] = [];

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    const rows = tableBuffer
      .filter((l) => !/^\|[\s\-:|]+\|$/.test(l.trim()))
      .map((l) =>
        l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()),
      );
    if (rows.length > 0) blocks.push({ type: "table", rows });
    tableBuffer = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("|")) {
      tableBuffer.push(line);
    } else {
      flushTable();
      blocks.push({ type: "line", line });
    }
  }
  flushTable();
  return blocks;
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
        const rawLines = seg.split("\n").filter((l) => l.trim() !== "");
        if (rawLines.length === 0) return null;
        const blocks = groupLines(rawLines);
        return (
          <Box key={si} flexDirection="column">
            {blocks.map((block, bi) => {
              if (block.type === "table")
                return <TableView key={bi} rows={block.rows} />;
              const { line } = block;
              if (line.match(/^#{1,3}\s/))
                return (
                  <Box key={bi}>
                    <Text bold>{line.replace(/^#+\s/, "")}</Text>
                  </Box>
                );
              if (line.match(/^[-*•]\s/))
                return (
                  <Box key={bi} gap={1}>
                    <Text color={ACCENT} dimColor>·</Text>
                    <InlineText text={line.slice(2).trim()} />
                  </Box>
                );
              if (line.match(/^\d+\.\s/)) {
                const num = line.match(/^(\d+)\.\s/)![1];
                return (
                  <Box key={bi} gap={1}>
                    <Text color="gray" dimColor>{num}.</Text>
                    <InlineText text={line.replace(/^\d+\.\s/, "").trim()} />
                  </Box>
                );
              }
              return (
                <Box key={bi}>
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
