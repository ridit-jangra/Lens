import React from "react";
import { marked } from "marked";
import { Text } from "ink";
import TerminalRenderer from "marked-terminal";
import chalk from "chalk";
import { ACCENT, GREEN, YELLOW } from "../colors";

marked.setOptions({
  renderer: new TerminalRenderer({
    code: chalk.hex(ACCENT),
    codespan: chalk.hex(ACCENT),
    firstHeading: chalk.bold.white,
    heading: chalk.bold.white,
    strong: chalk.bold.white,
    em: chalk.italic,
    link: chalk.hex(ACCENT).underline,
    href: chalk.hex(ACCENT).underline,
    listitem: (text: string) => `  ${chalk.hex(ACCENT)("*")} ${text}\n`,
  }),
});

interface MarkdownProps {
  children?: string;
}

export function Markdown({ children }: MarkdownProps) {
  return <Text>{marked.parse(children ?? "") as string}</Text>;
}
