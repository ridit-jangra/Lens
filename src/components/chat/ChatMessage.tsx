// StaticMessage.tsx
import React from "react";
import { Box, Text } from "ink";
import { tokenize } from "sugar-high";
import {
  ACCENT,
  TOKEN_KEYWORD,
  TOKEN_STRING,
  TOKEN_NUMBER,
  TOKEN_PROPERTY,
  TOKEN_ENTITY,
  TOKEN_TEXT,
  TOKEN_MUTED,
  TOKEN_COMMENT,
} from "../../colors";
import type { Message } from "../../types/chat";

const T_IDENTIFIER = 0;
const T_KEYWORD = 1;
const T_STRING = 2;
const T_CLS_NUMBER = 3;
const T_PROPERTY = 4;
const T_ENTITY = 5;
const T_JSX_LITERAL = 6;
const T_SIGN = 7;
const T_COMMENT = 8;
const T_BREAK = 9;
const T_SPACE = 10;

const JS_LANGS = new Set([
  "js",
  "javascript",
  "jsx",
  "ts",
  "typescript",
  "tsx",
  "mjs",
  "cjs",
]);

function tokenColor(type: number): string {
  switch (type) {
    case T_KEYWORD:
      return TOKEN_KEYWORD;
    case T_STRING:
      return TOKEN_STRING;
    case T_CLS_NUMBER:
      return TOKEN_NUMBER;
    case T_PROPERTY:
      return TOKEN_PROPERTY;
    case T_ENTITY:
      return TOKEN_ENTITY;
    case T_JSX_LITERAL:
      return TOKEN_TEXT;
    case T_SIGN:
      return TOKEN_MUTED;
    case T_COMMENT:
      return TOKEN_COMMENT;
    case T_IDENTIFIER:
      return TOKEN_TEXT;
    default:
      return TOKEN_TEXT;
  }
}

type SimpleToken = { color: string; text: string };

const PYTHON_KW = new Set([
  "def",
  "class",
  "import",
  "from",
  "return",
  "if",
  "elif",
  "else",
  "for",
  "while",
  "in",
  "not",
  "and",
  "or",
  "is",
  "None",
  "True",
  "False",
  "try",
  "except",
  "finally",
  "with",
  "as",
  "pass",
  "break",
  "continue",
  "raise",
  "yield",
  "lambda",
  "async",
  "await",
  "del",
  "global",
  "nonlocal",
  "assert",
]);
const RUST_KW = new Set([
  "fn",
  "let",
  "mut",
  "const",
  "struct",
  "enum",
  "impl",
  "trait",
  "pub",
  "use",
  "mod",
  "match",
  "if",
  "else",
  "loop",
  "while",
  "for",
  "in",
  "return",
  "self",
  "Self",
  "super",
  "where",
  "type",
  "as",
  "ref",
  "move",
  "unsafe",
  "extern",
  "dyn",
  "async",
  "await",
  "true",
  "false",
  "Some",
  "None",
  "Ok",
  "Err",
]);
const GO_KW = new Set([
  "func",
  "var",
  "const",
  "type",
  "struct",
  "interface",
  "package",
  "import",
  "return",
  "if",
  "else",
  "for",
  "range",
  "switch",
  "case",
  "default",
  "break",
  "continue",
  "goto",
  "defer",
  "go",
  "chan",
  "map",
  "make",
  "new",
  "nil",
  "true",
  "false",
  "error",
]);
const SHELL_KW = new Set([
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "for",
  "do",
  "done",
  "while",
  "case",
  "esac",
  "in",
  "function",
  "return",
  "echo",
  "export",
  "local",
  "source",
  "exit",
]);
const CSS_AT = /^@[\w-]+/;
const CSS_PROP = /^[\w-]+(?=\s*:)/;

function tokenizeGeneric(code: string, lang: string): SimpleToken[][] {
  const keywords =
    lang === "python" || lang === "py"
      ? PYTHON_KW
      : lang === "rust" || lang === "rs"
        ? RUST_KW
        : lang === "go"
          ? GO_KW
          : lang === "bash" ||
              lang === "sh" ||
              lang === "shell" ||
              lang === "zsh"
            ? SHELL_KW
            : new Set<string>();

  const lines = code.split("\n");
  return lines.map((line) => {
    const tokens: SimpleToken[] = [];
    let i = 0;

    const push = (color: string, text: string) => {
      if (text) tokens.push({ color, text });
    };

    while (i < line.length) {
      const rest = line.slice(i);

      const commentPrefixes =
        lang === "python" || lang === "py"
          ? ["#"]
          : lang === "bash" ||
              lang === "sh" ||
              lang === "shell" ||
              lang === "zsh"
            ? ["#"]
            : lang === "css" || lang === "scss"
              ? ["//", "/*"]
              : lang === "html" || lang === "xml"
                ? ["<!--"]
                : lang === "sql"
                  ? ["--", "#"]
                  : ["//", "#"];

      let matchedComment = false;
      for (const prefix of commentPrefixes) {
        if (rest.startsWith(prefix)) {
          push(TOKEN_COMMENT, line.slice(i));
          i = line.length;
          matchedComment = true;
          break;
        }
      }
      if (matchedComment) continue;

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
        push(TOKEN_STRING, line.slice(i, j));
        i = j;
        continue;
      }

      const numMatch = rest.match(/^-?\d+\.?\d*/);
      if (numMatch && (i === 0 || !/\w/.test(line[i - 1] ?? ""))) {
        push(TOKEN_NUMBER, numMatch[0]);
        i += numMatch[0].length;
        continue;
      }

      if (lang === "css" || lang === "scss") {
        const atMatch = rest.match(CSS_AT);
        if (atMatch) {
          push(TOKEN_KEYWORD, atMatch[0]);
          i += atMatch[0].length;
          continue;
        }
        const propMatch = rest.match(CSS_PROP);
        if (propMatch) {
          push(TOKEN_PROPERTY, propMatch[0]);
          i += propMatch[0].length;
          continue;
        }
      }

      if ((lang === "html" || lang === "xml") && line[i] === "<") {
        const tagMatch = rest.match(/^<\/?[\w:-]+/);
        if (tagMatch) {
          push(TOKEN_ENTITY, tagMatch[0]);
          i += tagMatch[0].length;
          continue;
        }
      }

      const wordMatch = rest.match(/^[a-zA-Z_$][\w$]*/);
      if (wordMatch) {
        const word = wordMatch[0];
        push(keywords.has(word) ? TOKEN_KEYWORD : TOKEN_TEXT, word);
        i += word.length;
        continue;
      }

      const opMatch = rest.match(/^[^\w\s"'`]+/);
      if (opMatch) {
        push(TOKEN_MUTED, opMatch[0]);
        i += opMatch[0].length;
        continue;
      }

      push(TOKEN_TEXT, line[i]!);
      i++;
    }

    return tokens;
  });
}

function HighlightedLine({ tokens }: { tokens: SimpleToken[] }) {
  return (
    <Text>
      {"  "}
      {tokens.map((t, i) => (
        <Text key={i} color={t.color as any}>
          {t.text}
        </Text>
      ))}
    </Text>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const normalizedLang = lang.toLowerCase().trim();

  let lines: SimpleToken[][];

  if (JS_LANGS.has(normalizedLang)) {
    const tokens = tokenize(code);
    const lineAccum: SimpleToken[][] = [[]];

    for (const [type, value] of tokens) {
      if (type === T_BREAK) {
        lineAccum.push([]);
      } else if (type !== T_SPACE) {
        lineAccum[lineAccum.length - 1]!.push({
          color: tokenColor(type),
          text: value,
        });
      } else {
        lineAccum[lineAccum.length - 1]!.push({
          color: TOKEN_TEXT,
          text: value,
        });
      }
    }
    lines = lineAccum;
  } else if (normalizedLang) {
    lines = tokenizeGeneric(code, normalizedLang);
  } else {
    lines = code.split("\n").map((l) => [{ color: TOKEN_TEXT, text: l }]);
  }

  return (
    <Box flexDirection="column" marginY={1} marginLeft={2}>
      {normalizedLang ? (
        <Text color={TOKEN_MUTED} dimColor>
          {normalizedLang}
        </Text>
      ) : null}
      {lines.map((lineTokens, i) => (
        <HighlightedLine key={i} tokens={lineTokens} />
      ))}
    </Box>
  );
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <Text key={i} bold color={TOKEN_TEXT}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return (
            <Text key={i} italic color={TOKEN_TEXT}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <Text key={i} color={ACCENT}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return (
          <Text key={i} color={TOKEN_TEXT}>
            {part}
          </Text>
        );
      })}
    </>
  );
}

function Heading({ level, text }: { level: 1 | 2 | 3; text: string }) {
  if (level === 1) {
    return (
      <Box marginTop={1}>
        <Text color={ACCENT} bold underline>
          {text}
        </Text>
      </Box>
    );
  }
  if (level === 2) {
    return (
      <Box marginTop={1}>
        <Text color={ACCENT} bold>
          {text}
        </Text>
      </Box>
    );
  }
  return (
    <Box marginTop={1}>
      <Text color={TOKEN_TEXT} bold>
        {text}
      </Text>
    </Box>
  );
}

function BulletItem({ text }: { text: string }) {
  return (
    <Box gap={1}>
      <Text color={ACCENT}>{"*"}</Text>
      <Box flexShrink={1}>
        <InlineText text={text} />
      </Box>
    </Box>
  );
}

function NumberedItem({ num, text }: { num: string; text: string }) {
  return (
    <Box gap={1}>
      <Text color={TOKEN_MUTED}>{num}.</Text>
      <Box flexShrink={1}>
        <InlineText text={text} />
      </Box>
    </Box>
  );
}

function BlockQuote({ text }: { text: string }) {
  return (
    <Box gap={1} marginLeft={1}>
      <Text color={TOKEN_MUTED}>{"│"}</Text>
      <Text color={TOKEN_MUTED} dimColor>
        {text}
      </Text>
    </Box>
  );
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "code"; lang: string; code: string }
  | { type: "bullet"; text: string }
  | { type: "numbered"; num: string; text: string }
  | { type: "blockquote"; text: string }
  | { type: "hr" }
  | { type: "paragraph"; text: string };

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const segments = content.split(/(```[\s\S]*?```)/g);

  for (const seg of segments) {
    if (seg.startsWith("```")) {
      const lines = seg.slice(3).split("\n");
      const lang = lines[0]?.trim() ?? "";
      const code = lines
        .slice(1)
        .join("\n")
        .replace(/```\s*$/, "")
        .trimEnd();
      blocks.push({ type: "code", lang, code });
      continue;
    }

    for (const line of seg.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const h3 = trimmed.match(/^### (.+)$/);
      const h2 = trimmed.match(/^## (.+)$/);
      const h1 = trimmed.match(/^# (.+)$/);
      if (h3) {
        blocks.push({ type: "heading", level: 3, text: h3[1]! });
        continue;
      }
      if (h2) {
        blocks.push({ type: "heading", level: 2, text: h2[1]! });
        continue;
      }
      if (h1) {
        blocks.push({ type: "heading", level: 1, text: h1[1]! });
        continue;
      }

      if (/^[-*_]{3,}$/.test(trimmed)) {
        blocks.push({ type: "hr" });
        continue;
      }

      if (trimmed.startsWith("> ")) {
        blocks.push({ type: "blockquote", text: trimmed.slice(2).trim() });
        continue;
      }

      if (/^[-*•]\s/.test(trimmed)) {
        blocks.push({ type: "bullet", text: trimmed.slice(2).trim() });
        continue;
      }

      const numMatch = trimmed.match(/^(\d+)\.\s(.+)/);
      if (numMatch) {
        blocks.push({
          type: "numbered",
          num: numMatch[1]!,
          text: numMatch[2]!,
        });
        continue;
      }

      blocks.push({ type: "paragraph", text: trimmed });
    }
  }

  return blocks;
}

function MessageBody({ content }: { content: string }) {
  const blocks = parseBlocks(content);

  return (
    <Box flexDirection="column">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            return <Heading key={i} level={block.level} text={block.text} />;
          case "code":
            return <CodeBlock key={i} lang={block.lang} code={block.code} />;
          case "bullet":
            return <BulletItem key={i} text={block.text} />;
          case "numbered":
            return <NumberedItem key={i} num={block.num} text={block.text} />;
          case "blockquote":
            return <BlockQuote key={i} text={block.text} />;
          case "hr":
            return (
              <Box key={i} marginY={1}>
                <Text color={TOKEN_MUTED} dimColor>
                  {"─".repeat(40)}
                </Text>
              </Box>
            );
          case "paragraph":
            return (
              <Box key={i}>
                <InlineText text={block.text} />
              </Box>
            );
        }
      })}
    </Box>
  );
}

export function StaticMessage({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <Box marginBottom={1} gap={1}>
        <Text color={TOKEN_MUTED}>{">"}</Text>
        <Text color={TOKEN_TEXT} bold>
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
      "generate-pdf": "P",
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
          <Text
            color={msg.approved ? TOKEN_MUTED : "red"}
            dimColor={!msg.approved}
          >
            {label}
          </Text>
          {!msg.approved && <Text color="red">denied</Text>}
        </Box>
        {msg.approved && msg.result && (
          <Box marginLeft={2}>
            <Text color={TOKEN_MUTED}>
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
          <Text color={msg.applied ? "green" : TOKEN_MUTED}>
            {msg.applied ? "✓" : "·"}
          </Text>
          <Text
            color={msg.applied ? "green" : TOKEN_MUTED}
            dimColor={!msg.applied}
          >
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
