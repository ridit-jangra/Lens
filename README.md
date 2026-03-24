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

```
lens chat / vibe                        chat with your codebase
lens chat -p /path/to/repo              chat in a specific repo

lens review / judge                     AI review of the current directory
lens review /path/to/repo               AI review of a specific repo

lens repo / stalk <url>                 analyze a remote GitHub repository

lens task / cook <text>                 apply a natural language change to the codebase
lens task / cook <text> -p /path        apply change to a specific repo

lens commit / crimes                    generate a smart commit message from staged changes
lens commit / crimes [files...]         stage specific files and generate a commit message
lens commit / crimes --auto             stage all changes and commit without confirmation
lens commit / crimes --confirm          show preview before committing when using --auto
lens commit / crimes --preview          show the generated message without committing
lens commit / crimes --push             push to remote after committing

lens timeline / history                 explore commit history
lens timeline / history -p /path        explore history of a specific repo

lens run / spy                          run a dev command and get AI suggestions for errors

lens provider                           configure AI providers
```

## Chat Commands

Once inside a `lens chat / vibe` session, use slash commands:

```
/timeline              browse commit history
/review                AI review of the current codebase
/auto                  toggle auto-approve for safe tools (read, search, fetch)
/auto --force-all      auto-approve ALL tools including shell and writes ⚠️
/chat list             list saved chat sessions for this repo
/chat load <name>      load a saved chat session
/chat rename <name>    rename the current session
/chat delete <name>    delete a saved session
/memory list           list stored memories for this repo
/memory add <text>     add a memory
/memory delete <id>    delete a memory by ID
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
