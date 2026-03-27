# Lens

A terminal-based AI coding assistant that helps you understand and work with your codebase — directly from the CLI.

```
◆ lens
✓ LENS.md loaded

 you list all files here
  ✓ Listed .
◆ Here are the files in the current directory:
  * main.py - Python main file
  * README.md - Documentation
```

## Features

- **Conversational codebase exploration** — ask questions, list files, search patterns, run commands
- **Persistent session history** — conversations are saved per project and restored on next run
- **Turn-based display** — tool calls are grouped with the message that triggered them and persist on screen
- **File diffs** — write and edit operations show full before/after diffs inline
- **LENS.md context** — run `/init` to generate a codebase summary that gets injected into every prompt
- **Multi-provider** — supports Groq, Anthropic, OpenAI, and Google

## Packages

| Package | Description |
|---|---|
| `packages/lens` | CLI entry point and UI (Ink/React) |
| `packages/core` | Agent, session, memory, tools, providers |
| `packages/ui` | Shared Ink components (InputBox, MessageBody, Diff, etc.) |
| `packages/sdk` | Lens SDK for programmatic use |

## Getting Started

```sh
# Install dependencies
bun install

# Configure a provider (e.g. Groq)
bun lens config set-provider groq --api-key YOUR_KEY

# Run in any project directory
cd your-project
bun lens
```

## Commands

| Command | Description |
|---|---|
| `/init` | Analyze the codebase and generate `LENS.md` |
| `/memory` | Show what Lens knows about this project |
| `/clear` | Clear the current session |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Ctrl+←/→` | Move by word |
| `Esc` | Interrupt response |
| `Ctrl+C` | Quit |

## Development

```sh
# Run the CLI directly
bun packages/lens/src/index.tsx

# Build all packages
bun run build

# Type check
bun run check-types
```

## Stack

- [Bun](https://bun.sh) — runtime and package manager
- [Ink](https://github.com/vadimdemedes/ink) — React for CLIs
- [Turborepo](https://turbo.build) — monorepo build system
- [TypeScript](https://www.typescriptlang.org)
