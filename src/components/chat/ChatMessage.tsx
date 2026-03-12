import React from "react";
import { Box, Text } from "ink";
import figures from "figures";
import { ORANGE } from "../../colors";
import type { Message } from "../../types/chat";

type Token = { text: string; color: string };

const KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "class",
  "extends",
  "import",
  "export",
  "from",
  "default",
  "async",
  "await",
  "try",
  "catch",
  "finally",
  "throw",
  "new",
  "typeof",
  "instanceof",
  "in",
  "of",
  "switch",
  "case",
  "break",
  "continue",
  "type",
  "interface",
  "enum",
  "void",
  "null",
  "undefined",
  "true",
  "false",
  "this",
  "super",
  "static",
  "readonly",
  "public",
  "private",
  "protected",
  "abstract",
  "implements",
  "declare",
  "namespace",
  "module",
  "require",
  "yield",
  "delete",
  "get",
  "set",
]);

function tokenise(line: string, lang: string): Token[] {
  if (["bash", "shell", "sh", "text", "plain", "output"].includes(lang)) {
    if (line.startsWith("#")) return [{ text: line, color: "green" }];
    if (line.startsWith("$")) return [{ text: line, color: "cyan" }];
    return [{ text: line, color: "white" }];
  }

  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    if (
      (line[i] === "/" && line[i + 1] === "/") ||
      (line[i] === "#" && lang === "python")
    ) {
      tokens.push({ text: line.slice(i), color: "green" });
      break;
    }

    if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
      const quote = line[i]!;
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === "\\") {
          j += 2;
          continue;
        }
        if (line[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ text: line.slice(i, j), color: "yellow" });
      i = j;
      continue;
    }

    if (/\d/.test(line[i]!)) {
      let j = i;
      while (j < line.length && /[\d._xXa-fA-F]/.test(line[j]!)) j++;
      tokens.push({ text: line.slice(i, j), color: "magenta" });
      i = j;
      continue;
    }

    if (/[a-zA-Z_$]/.test(line[i]!)) {
      let j = i;
      while (j < line.length && /[\w$]/.test(line[j]!)) j++;
      const word = line.slice(i, j);
      if (KEYWORDS.has(word)) {
        tokens.push({ text: word, color: "blue" });
      } else if (/^[A-Z]/.test(word)) {
        tokens.push({ text: word, color: "cyan" });
      } else {
        tokens.push({ text: word, color: "white" });
      }
      i = j;
      continue;
    }

    const char = line[i]!;
    const opColor = /[(){}[\];,.]/.test(char)
      ? "gray"
      : /[=<>!+\-*/%&|^~?:]/.test(char)
        ? "red"
        : "white";
    tokens.push({ text: char, color: opColor });
    i++;
  }

  return tokens;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const lines = code.split("\n");
  const displayLang = lang || "code";

  return (
    <Box flexDirection="column" marginY={1}>
      {/* header */}
      <Box paddingX={1} gap={2}>
        <Text color="gray" dimColor>
          ╭─
        </Text>
        <Text color="gray" dimColor>
          {displayLang}
        </Text>
      </Box>
      {/* lines */}
      {lines.map((line, idx) => {
        const toks = tokenise(line, displayLang);
        return (
          <Box key={idx} gap={0}>
            <Text color="gray" dimColor>
              {"│ "}
            </Text>
            {toks.length === 0 ? (
              <Text> </Text>
            ) : (
              toks.map((tok, ti) => (
                <Text key={ti} color={tok.color as any}>
                  {tok.text}
                </Text>
              ))
            )}
          </Box>
        );
      })}
      {/* footer */}
      <Box paddingX={1}>
        <Text color="gray" dimColor>
          ╰─
        </Text>
      </Box>
    </Box>
  );
}

function InlineText({
  text,
  color = "white",
}: {
  text: string;
  color?: string;
}) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <Text key={i} color="yellow">
            {part.slice(1, -1)}
          </Text>
        ) : (
          <Text key={i} color={color as any}>
            {part}
          </Text>
        ),
      )}
    </>
  );
}

type Segment =
  | { type: "text"; content: string }
  | { type: "code"; lang: string; content: string };

function parseSegments(raw: string): Segment[] {
  const segments: Segment[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) {
      segments.push({ type: "text", content: raw.slice(last, m.index) });
    }
    segments.push({ type: "code", lang: m[1] ?? "", content: m[2] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < raw.length) {
    segments.push({ type: "text", content: raw.slice(last) });
  }
  return segments;
}

function MessageBody({ content }: { content: string }) {
  const segments = parseSegments(content);
  return (
    <Box flexDirection="column" gap={0}>
      {segments.map((seg, i) =>
        seg.type === "code" ? (
          <CodeBlock key={i} code={seg.content} lang={seg.lang} />
        ) : (
          <Box key={i} flexDirection="column">
            {seg.content
              .split("\n")
              .filter(
                (l, li, arr) =>
                  !(li === 0 && l === "") &&
                  !(li === arr.length - 1 && l === ""),
              )
              .map((line, li) => {
                if (/^[-*•]\s/.test(line)) {
                  return (
                    <Box key={li} gap={1}>
                      <Text color="gray">{figures.pointer}</Text>
                      <InlineText text={line.replace(/^[-*•]\s/, "")} />
                    </Box>
                  );
                }

                if (/^\d+\.\s/.test(line)) {
                  const num = line.match(/^(\d+\.)\s/)?.[1] ?? "";
                  return (
                    <Box key={li} gap={1}>
                      <Text color="gray">{num}</Text>
                      <InlineText text={line.replace(/^\d+\.\s/, "")} />
                    </Box>
                  );
                }

                if (/\*\*.+\*\*/.test(line)) {
                  const parts = line.split(/(\*\*[^*]+\*\*)/g);
                  return (
                    <Box key={li} flexWrap="wrap">
                      {parts.map((p, pi) =>
                        p.startsWith("**") && p.endsWith("**") ? (
                          <Text key={pi} bold color="white">
                            {p.slice(2, -2)}
                          </Text>
                        ) : (
                          <InlineText key={pi} text={p} />
                        ),
                      )}
                    </Box>
                  );
                }
                if (line === "") return <Text key={li}> </Text>;
                return <InlineText key={li} text={line} />;
              })}
          </Box>
        ),
      )}
    </Box>
  );
}

function UserLabel() {
  return (
    <Box gap={1} marginBottom={0}>
      <Text color="green" bold>
        {figures.triangleRight}
      </Text>
      <Text color="green" bold>
        You
      </Text>
    </Box>
  );
}

function AssistantLabel() {
  return (
    <Box gap={1} marginBottom={0}>
      <Text color={ORANGE} bold>
        {figures.squareSmallFilled}
      </Text>
      <Text color={ORANGE} bold>
        Lens
      </Text>
    </Box>
  );
}

function ToolMessage({ msg }: { msg: Extract<Message, { type: "tool" }> }) {
  const iconMap: Record<string, string> = {
    shell: "$",
    fetch: "↗",
    "read-file": "📄",
    "write-file": "✎",
  };
  const colorMap: Record<string, string> = {
    shell: "yellow",
    fetch: "cyan",
    "read-file": "blue",
    "write-file": "green",
  };

  const icon = iconMap[msg.toolName] ?? figures.pointer;
  const color = (colorMap[msg.toolName] ?? "gray") as any;
  const label =
    msg.toolName === "shell" || msg.toolName === "fetch"
      ? msg.content
      : msg.content;

  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={2}>
      <Box
        gap={1}
        borderStyle="single"
        borderColor={msg.approved ? color : "red"}
        paddingX={1}
      >
        <Text color={color} bold>
          {icon}
        </Text>
        <Text color={color}>{msg.toolName}</Text>
        <Text color="gray" dimColor>
          {label.length > 60 ? label.slice(0, 57) + "…" : label}
        </Text>
        {!msg.approved && <Text color="red"> ✗ denied</Text>}
        {msg.approved && <Text color="green"> ✓</Text>}
      </Box>
      {msg.approved && msg.result && (
        <Box marginLeft={1} marginTop={0}>
          <Text color="gray" dimColor>
            {msg.result.length > 300
              ? msg.result.slice(0, 297) + "…"
              : msg.result}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export function StaticMessage({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <UserLabel />
        <Box marginLeft={2}>
          <Text color="white">{msg.content}</Text>
        </Box>
      </Box>
    );
  }

  if (msg.type === "tool") {
    return <ToolMessage msg={msg} />;
  }

  if (msg.type === "plan") {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <AssistantLabel />
        <Box marginLeft={2} flexDirection="column">
          <MessageBody content={msg.content} />
          <Box gap={1} marginTop={1}>
            <Text color={msg.applied ? "green" : "red"}>
              {msg.applied ? figures.tick : figures.cross}
            </Text>
            <Text color={msg.applied ? "green" : "red"}>
              {msg.applied ? "Changes applied to disk" : "Changes were skipped"}
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <AssistantLabel />
      <Box marginLeft={2}>
        <MessageBody content={msg.content} />
      </Box>
    </Box>
  );
}
