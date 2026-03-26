import React, { useState, useEffect } from "react";
import { Text, useInput } from "ink";
import chalk from "chalk";

function isWordChar(ch: string): boolean {
  return /[\w]/.test(ch);
}

function wordBoundaryLeft(text: string, pos: number): number {
  if (pos <= 0) return 0;
  let i = pos - 1;

  while (i > 0 && !isWordChar(text[i]!)) i--;

  while (i > 0 && isWordChar(text[i - 1]!)) i--;
  return i;
}

function wordBoundaryRight(text: string, pos: number): number {
  const len = text.length;
  if (pos >= len) return len;
  let i = pos;

  while (i < len && isWordChar(text[i]!)) i++;

  while (i < len && !isWordChar(text[i]!)) i++;
  return i;
}

export interface TextAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  focus?: boolean;
  placeholder?: string;
}

export function TextArea({
  value,
  onChange,
  onSubmit,
  focus = true,
  placeholder = "",
}: TextAreaProps) {
  const [cursor, setCursor] = useState(value.length);
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    const lenDiff = Math.abs(value.length - prevValue.length);
    if (cursor > value.length || lenDiff > 1) {
      setCursor(value.length);
    }
  }

  useInput(
    (input, key) => {
      if (key.upArrow || key.downArrow) return;
      if (key.tab || (key.shift && key.tab)) return;
      if (key.ctrl && input === "c") return;

      const isShiftEnter =
        (key.return && key.shift) ||
        input === "\x1b[27;2;13~" ||
        input === "\x1b[13;2u";

      if (key.return && !key.meta && !key.shift && !isShiftEnter) {
        onSubmit(value);
        return;
      }

      if (isShiftEnter) {
        const next = value.slice(0, cursor) + "\n" + value.slice(cursor);
        onChange(next);
        setCursor((c) => c + 1);
        return;
      }

      if (key.leftArrow && key.ctrl) {
        setCursor(wordBoundaryLeft(value, cursor));
        return;
      }

      if (key.rightArrow && key.ctrl) {
        setCursor(wordBoundaryRight(value, cursor));
        return;
      }

      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }

      if (key.rightArrow) {
        setCursor((c) => Math.min(value.length, c + 1));
        return;
      }

      if (key.ctrl && input === "a") {
        const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
        setCursor(lineStart);
        return;
      }

      if (key.ctrl && input === "e") {
        const lineEnd = value.indexOf("\n", cursor);
        setCursor(lineEnd === -1 ? value.length : lineEnd);
        return;
      }

      if (key.ctrl && input === "u") {
        const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
        onChange(value.slice(0, lineStart) + value.slice(cursor));
        setCursor(lineStart);
        return;
      }

      if (key.ctrl && input === "k") {
        const lineEnd = value.indexOf("\n", cursor);
        onChange(
          value.slice(0, cursor) + (lineEnd === -1 ? "" : value.slice(lineEnd)),
        );
        return;
      }

      if (key.ctrl && input === "f") return;

      if ((key.ctrl && key.delete) || input === "\x1b[3;5~") {
        const to = wordBoundaryLeft(value, cursor);
        onChange(value.slice(0, to) + value.slice(cursor));
        setCursor(to);
        return;
      }

      if (key.backspace || key.delete) {
        if (cursor > 0) {
          onChange(value.slice(0, cursor - 1) + value.slice(cursor));
          setCursor((c) => c - 1);
        }
        return;
      }

      if (key.escape) return;

      if (input) {
        const next = value.slice(0, cursor) + input + value.slice(cursor);
        onChange(next);
        setCursor((c) => c + input.length);
      }
    },
    { isActive: focus },
  );

  if (value.length === 0 && placeholder) {
    return (
      <Text>
        {chalk.inverse(placeholder[0] ?? " ")}
        {placeholder.length > 1 ? chalk.gray(placeholder.slice(1)) : ""}
      </Text>
    );
  }

  let rendered = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (i === cursor) {
      rendered += ch === "\n" ? chalk.inverse(" ") + "\n" : chalk.inverse(ch);
    } else {
      rendered += ch;
    }
  }
  if (cursor === value.length) {
    rendered += chalk.inverse(" ");
  }

  return <Text>{rendered}</Text>;
}
