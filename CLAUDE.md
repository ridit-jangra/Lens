# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
# Run the CLI against a test directory
bun packages/lens/src/index.tsx

# Build the publishable CLI binary
cd packages/lens && bun run build

# Type-check all packages
bun run check-types

# Format
bun run format

# Run all tests
bun test

# Run tests for a specific package
cd packages/core && bun test
cd packages/lens && bun test
```

## Architecture

This is a Bun + Turborepo monorepo. Packages import each other via workspace aliases (`@ridit/lens-core`, `@ridit/ink-ui`) and are resolved at runtime without a build step during development.

### `packages/core` (`@ridit/lens-core`)

The backend. Key modules:

- **`agent/`** — `chat()` wraps Vercel AI SDK's `streamText`. Fires `onToolCall` after each step completes (i.e. after the tool result is available, not before execution). `maxSteps: 50`.
- **`providers/`** — reads `~/.lens/config.json` via `getActiveProvider()` and returns the correct Vercel AI SDK `LanguageModel`. Groq uses the OpenAI-compatible adapter.
- **`tools/`** — `{ read, write, bash, grep, ls, remember }` passed directly to `streamText`. All tool schemas are defined with Zod.
- **`memory/`** — sessions saved to `~/.lens/memory/{id}.json`. `getSystemPrompt(cwd)` injects `LENS.md` (project context) and `~/.lens/global-memory.txt` (global memory) into the system prompt.
- **`config/`** — provider config at `~/.lens/config.json`.

### `packages/lens` (CLI)

Ink/React UI. Entry point: `src/index.tsx` → `<ChatView />`.

**Turn-based state model** in `ChatView`:
- A `Turn` = `{ userText, toolCalls[], assistantText }`.
- Completed turns go into `turns[]` state rendered via Ink's `<Static>` (frozen, never re-rendered).
- The in-progress turn is rendered separately below Static with live `liveToolCalls` state.
- On `onToolCall`, if it's a write tool, the existing file is read synchronously and injected as `_prevContent` into args so `ToolCall` can render a before/after diff.
- `onToolCall` fires **after** tool execution (it's `onStepFinish` in the agent), so `_prevContent` captures the file state before the write only if read before the write actually happens — this works because the hook fires when the step result arrives, and the file read in `onToolCall` happens before the next render.

**`ToolCall` component** (`src/components/ToolCall.tsx`):
- Maps raw tool names to human-friendly labels via `TOOL_LABELS`.
- Detects file tools and calls `extractFileDiff()` to parse args into `{ path, removals[], additions[] }`.
- Renders using the `<Diff>` component from `@ridit/ink-ui`.
- Diff lines are always shown (not hidden after completion).

### `packages/ui` (`@ridit/ink-ui`)

Shared Ink components. All color constants exported from `src/colors.ts`:
- `ACCENT = "#DA7758"` (orange) — assistant icon, code text, cursor
- `GREEN`, `YELLOW`, `RED` — tool status, diff lines

`MessageBody` renders markdown-like content: parses ` ``` ` blocks first, then handles `**bold**`, `` `inline code` ``, `# headings`, `- lists`, `1. numbered lists` line by line. Empty segments are skipped to avoid phantom blank lines in Ink.

## Key Constraints

- **Ink's `<Static>`** only renders items once and freezes them. Never put state that changes into Static items — it won't update.
- **`onToolCall` timing**: fires after the tool result is ready (via `onStepFinish`), not before execution. The file read for `_prevContent` must happen before the actual write — this currently works by coincidence of ordering but could break if the agent batches steps differently.
- Provider config lives at `~/.lens/config.json`, not in the repo.
