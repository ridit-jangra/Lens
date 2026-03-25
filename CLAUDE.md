# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lens is an AI-powered CLI tool for natural language interaction with codebases. It uses React 19 + Ink 6 for terminal UI rendering, Commander.js for CLI parsing, and supports multiple LLM providers (Anthropic, OpenAI, Gemini, Ollama, custom OpenAI-compatible endpoints).

Published as `@ridit/lens` on npm. User config lives in `~/.lens/` (config.json, memory.json, addons/).

## Build Commands

```bash
bun run build          # Build to dist/index.mjs (adds Node shebang post-build)
bun install            # Install dependencies
```

There are no lint or test scripts configured. TypeScript strict mode serves as the primary static analysis tool.

## Architecture

**CLI entry** (`src/index.tsx`): Registers 8 commands via Commander.js, loads built-in tools and user addons, then renders Ink React components.

**Commands** (`src/commands/`): Each command (chat, commit, review, repo, task, timeline, provider, run) is a React component rendered by Ink.

**Components** (`src/components/`): Reusable Ink UI components organized by feature (chat/, provider/, repo/, task/, timeline/, watch/). Chat is the most complex — `ChatRunner.tsx` handles tool execution, permission prompts, and the main interaction loop.

**Tools** (`src/tools/`): Capability implementations (file ops, shell, web fetch, PDF, git, charts, images). Registered at startup via the tool registry.

**Tool Registry** (`src/utils/tools/registry.ts`): Central registry implementing `@ridit/lens-sdk` interface. Supports intent-based filtering — readonly intents never see write/shell/delete tools. Tools are tagged with `TOOL_TAGS.read`, `write`, `delete`, `shell`, `net`.

**Intent Classifier** (`src/utils/intentClassifier.ts`): Regex-based classification of user messages into readonly/mutating/any scopes. Controls which tools appear in the LLM system prompt.

**LLM Abstraction** (`src/utils/ai.ts`): `callModel()` provides a unified interface across all 5 provider types.

**Response Parsing** (`src/utils/chat.ts`): Parses LLM responses for tool calls (XML tags or fenced code blocks), file patches, and clone operations.

**Types** (`src/types/`): Discriminated unions are used throughout — every multi-step UI flow uses `type` + `stage` fields (e.g., `ChatStage`, `ReviewStage`) for exhaustive pattern matching.

**Memory** (`src/utils/memory.ts`): File-based persistence with session-only entries (in-memory, 200 max) and persistent entries (~/.lens/memory.json, global + repo-scoped).

**Addons** (`src/utils/addons/loadAddons.ts`): Plugin system loading tools from `~/.lens/addons/` using `defineTool()` from `@ridit/lens-sdk`.

## Key Patterns

- **Discriminated union state machines**: All commands use `{ type, stage }` unions for multi-step flows. Add new stages by extending the union and handling them exhaustively.
- **Provider-agnostic LLM calls**: All provider differences are encapsulated in `callModel()` — never call provider SDKs directly from commands/components.
- **Intent-scoped tool visibility**: The intent classifier determines which tools the LLM can see. Readonly queries hide mutating tools for safety.
- **Conventional commits**: The project uses conventional commit format (e.g., `feat(chat):`, `chore:`, `fix:`).
- **Bun as package manager and bundler**: Use `bun` for all dependency and build operations, not npm/yarn.
