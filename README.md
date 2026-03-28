# Lens

Lens is an AI-powered CLI tool that lets you explore, understand, and modify any codebase through natural language. Built with React and Ink for a rich terminal UI, Lens connects to multiple LLM providers and gives the AI direct access to your filesystem, shell, and the web.

## Features

- **Chat with your codebase** — ask questions, request changes, scaffold new files
- **Multi-provider support** — Anthropic, OpenAI, Gemini, Ollama, or any OpenAI-compatible API
- **Tool system** — AI can read/write files, run shell commands, fetch URLs, search the web, clone repos, generate PDFs, and more
- **Plugin registry** — extend Lens with custom tools via `@ridit/lens-sdk`
- **Diff preview** — proposed code changes are shown as a diff before applying
- **Auto-approve mode** — `/auto` skips confirmation for safe read/search tools
- **Force-all mode** — `/auto --force-all` approves everything including shell and writes
- **Persistent memory** — Lens remembers project-specific context across sessions
- **Chat history** — save, load, rename, and delete chat sessions per repo
- **Smart commits** — generate conventional commit messages from staged changes
- **Timeline** — browse and explore commit history
- **Repo analysis** — deep codebase review from a remote URL or local path

## Installation

```bash
# using bun
bun add @ridit/lens -g

# using npm
npm install -g @ridit/lens
```

## CLI Commands

### Available

```
lens                                    open interactive chat (default)
lens chat                               chat with your codebase
lens chat -p /path/to/repo              chat in a specific repo
lens chat --session <id>                resume or create a session by ID
lens chat --prompt <text>               send a single prompt non-interactively
lens chat --dev                         output structured JSON (for SDK/tooling use)
lens chat --single                      run one message then exit, resumes latest session
lens chat --force-all                   auto-approve all tools including writes and shell
lens chat --dev --prompt <text>         headless mode: JSON output, no UI

lens provider                           configure AI providers (interactive)
lens provider --list                    list configured providers
lens provider --provider <name> --model <model> --api-key <key>   add/update a provider
lens provider --switch <name>           switch the active provider
lens provider --remove <name>           remove a provider
lens provider --dev                     output result as JSON

lens task <text>                        apply a natural language change to the codebase
lens commit                             generate a smart commit message from staged changes
lens commit --auto                      stage all and commit without confirmation
lens commit --push                      push to remote after committing
```

### Work in progress

The following commands existed in a previous version of Lens and are being restored after a core rewrite. They are registered but not fully functional yet:

```
lens review                             AI review of the codebase        (coming soon)
lens repo <url>                         analyze a remote repository      (coming soon)
lens timeline                           explore commit history            (coming soon)
lens run <cmd>                          run dev server, auto-fix errors  (coming soon)
```

## Chat Commands

Once inside a `lens chat` session, use slash commands:

```
/auto                  toggle auto-approve for safe tools (read, search, fetch)
/auto --force-all      auto-approve ALL tools including shell and writes ⚠️
/provider              configure AI provider without leaving chat
/memory list           list stored memories for this repo
/memory add <text>     add a memory
/memory clear          clear all memories for this repo
/clear history         wipe session memory for this repo
```

## Supported Providers

- **Anthropic** — Claude models
- **OpenAI** — GPT models
- **Gemini** — Google Gemini models
- **Ollama** — local models (free, fully offline)
- **Custom** — any OpenAI-compatible API endpoint

## Extending Lens

Custom tools can be built and registered using `[@ridit/lens-sdk](https://www.npmjs.com/package/@ridit/lens-sdk)`.

## License

MIT
