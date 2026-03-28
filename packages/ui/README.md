# @ridit/ink-ui

Internal shared Ink/React component library for [Lens](https://github.com/ridit-jangra/Lens).

## Components

### `<Markdown>`

Renders a markdown string in the terminal.

### `<MessageBody>`

Renders markdown-like content inline: ` ``` ` code blocks, `**bold**`, `` `inline code` ``, `# headings`, `- lists`, `1. numbered lists`. Empty segments are skipped to avoid phantom blank lines in Ink.

### `<Diff>`

Renders a before/after file diff with colored addition/removal lines.

### `<TextArea>`

Multi-line terminal text input with cursor support.

### `<InputBox>` / `<ShortcutBar>`

Input box with a prompt indicator and a shortcut hint bar.

### `<CommandPalette>`

Fuzzy-filtered command picker rendered inline.

## Colors

```ts
import { ACCENT, GREEN, YELLOW, RED } from "@ridit/ink-ui";

// ACCENT  = "#DA7758"  — orange, used for assistant icon, code text, cursor
// GREEN   = "#7DC8A4"  — tool success, diff additions
// YELLOW  = "#E8C97A"  — warnings
// RED     = "#E87878"  — tool errors, diff removals
```

## License

MIT
