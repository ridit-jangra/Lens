import React, { useState, useEffect } from "react";
import { Text, useInput } from "ink";
import chalk from "chalk";

/**
 * Custom TextArea component replacing ink-text-input.
 *
 * Supports:
 * - Ctrl+Left/Right: word navigation
 * - Ctrl+Backspace / Ctrl+W: delete word backward
 * - Ctrl+Delete: delete word forward
 * - Home/End (Ctrl+A/Ctrl+E): line start/end
 * - Ctrl+U: clear line before cursor
 * - Ctrl+K: clear line after cursor
 * - Multi-line editing (Alt+Enter to insert newline)
 * - Proper visual wrapping at terminal width
 * - Paste support (including multi-line)
 */

function isWordChar(ch: string): boolean {
  return /[\w]/.test(ch);
}

function wordBoundaryLeft(text: string, pos: number): number {
  if (pos <= 0) return 0;
  let i = pos - 1;
  // Skip whitespace/non-word chars
  while (i > 0 && !isWordChar(text[i]!)) i--;
  // Skip word chars
  while (i > 0 && isWordChar(text[i - 1]!)) i--;
  return i;
}

function wordBoundaryRight(text: string, pos: number): number {
  const len = text.length;
  if (pos >= len) return len;
  let i = pos;
  // Skip current word chars
  while (i < len && isWordChar(text[i]!)) i++;
  // Skip whitespace/non-word chars
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

  // Detect external value changes (e.g. history navigation) vs internal edits.
  // If value changed but our cursor is beyond the new length, clamp it.
  // If value changed drastically (not a 1-char diff), snap cursor to end.
  if (value !== prevValue) {
    setPrevValue(value);
    const lenDiff = Math.abs(value.length - prevValue.length);
    if (cursor > value.length || lenDiff > 1) {
      setCursor(value.length);
    }
  }

  useInput(
    (input, key) => {
      // Ignore keys consumed by parent (arrows for history, tab, Ctrl+C)
      if (key.upArrow || key.downArrow) return;
      if (key.tab || (key.shift && key.tab)) return;
      if (key.ctrl && input === "c") return;

      // Submit on Enter
      if (key.return && !key.meta) {
        onSubmit(value);
        return;
      }

      // Alt+Enter or Ctrl+J: insert newline
      if ((key.return && key.meta) || (key.ctrl && input === "j")) {
        const next =
          value.slice(0, cursor) + "\n" + value.slice(cursor);
        onChange(next);
        setCursor((c) => c + 1);
        return;
      }

      // Ctrl+Left: word left
      if (key.leftArrow && key.ctrl) {
        setCursor(wordBoundaryLeft(value, cursor));
        return;
      }

      // Ctrl+Right: word right
      if (key.rightArrow && key.ctrl) {
        setCursor(wordBoundaryRight(value, cursor));
        return;
      }

      // Left arrow
      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }

      // Right arrow
      if (key.rightArrow) {
        setCursor((c) => Math.min(value.length, c + 1));
        return;
      }

      // Home / Ctrl+A: start of current line
      if (key.ctrl && input === "a") {
        // Find start of current line
        const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
        setCursor(lineStart);
        return;
      }

      // End / Ctrl+E: end of current line
      if (key.ctrl && input === "e") {
        const lineEnd = value.indexOf("\n", cursor);
        setCursor(lineEnd === -1 ? value.length : lineEnd);
        return;
      }

      // Ctrl+U: clear from cursor to line start
      if (key.ctrl && input === "u") {
        const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
        onChange(value.slice(0, lineStart) + value.slice(cursor));
        setCursor(lineStart);
        return;
      }

      // Ctrl+K: clear from cursor to line end
      if (key.ctrl && input === "k") {
        const lineEnd = value.indexOf("\n", cursor);
        onChange(
          value.slice(0, cursor) +
            (lineEnd === -1 ? "" : value.slice(lineEnd)),
        );
        return;
      }

      // Ctrl+W: delete word backward
      if (key.ctrl && input === "w") {
        const to = wordBoundaryLeft(value, cursor);
        onChange(value.slice(0, to) + value.slice(cursor));
        setCursor(to);
        return;
      }

      // Ctrl+Delete: delete word forward
      if (key.ctrl && key.delete) {
        const to = wordBoundaryRight(value, cursor);
        onChange(value.slice(0, cursor) + value.slice(to));
        return;
      }

      // Backspace
      if (key.backspace || key.delete) {
        if (cursor > 0) {
          onChange(value.slice(0, cursor - 1) + value.slice(cursor));
          setCursor((c) => c - 1);
        }
        return;
      }

      // Escape: ignore (let parent handle)
      if (key.escape) return;

      // Regular input (including paste)
      if (input) {
        const next =
          value.slice(0, cursor) + input + value.slice(cursor);
        onChange(next);
        setCursor((c) => c + input.length);
      }
    },
    { isActive: focus },
  );

  // Render the text with cursor
  if (value.length === 0 && placeholder) {
    return (
      <Text>
        {chalk.inverse(placeholder[0] ?? " ")}
        {placeholder.length > 1 ? chalk.gray(placeholder.slice(1)) : ""}
      </Text>
    );
  }

  // Build rendered string with visual cursor
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
