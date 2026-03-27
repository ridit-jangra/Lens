import React from "react";
import { marked } from "marked";
import { Text } from "ink";
import TerminalRenderer from "marked-terminal";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

interface MarkdownProps {
  children?: string;
}

export function Markdown({ children }: MarkdownProps) {
  return <Text>{marked.parse(children ?? "") as string}</Text>;
}
