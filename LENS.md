# Lens
> Generated: 2026-03-24T12:54:30.944Z

## Overview
Lens is an AI-powered CLI tool built with React and Ink that lets users explore, understand, and modify codebases through natural language. It provides chat functionality, code reviews, commit message generation, and timeline exploration of repositories. The tool connects to multiple LLM providers and gives AI direct access to the filesystem, shell, and web.

## Architecture
The system uses a command-based architecture where each major feature (chat, review, commit, timeline) is implemented as a separate command component. These components use React with Ink for terminal rendering and manage complex multi-step interactions through state machines. The AI provider system in src/utils/ai.ts provides a unified interface to multiple LLM APIs, while the tool system allows the AI to interact with the filesystem and execute commands.

## Tooling & Conventions
- **packageManager**: bun
- **language**: TypeScript
- **runtime**: Node.js
- **bundler**: tsup
- **framework**: React + Ink

## Important Folders
- src/commands: Contains chat.tsx, commit.tsx, review.tsx, timeline.tsx - each exports an Ink component that is the top-level renderer for that CLI command
- src/utils: Contains ai.ts with callModel abstraction supporting Anthropic/Gemini/Ollama/OpenAI providers via a unified Provider type
- src/components: Contains React components for terminal UI rendering using Ink

## Key Files
- src/utils/ai.ts: callModel abstraction supporting anthropic/gemini/ollama/openai providers via a unified Provider type
- src/commands/chat.tsx: Main chat interface component with session management
- src/commands/commit.tsx: Commit message generation from staged changes
- src/commands/review.tsx: Code review functionality for repositories
- src/commands/timeline.tsx: Commit history exploration interface

## Patterns & Idioms
- Discriminated union state machines (type + stage fields) for multi-step UI flows in every command component
- Provider abstraction pattern in ai.ts that handles multiple AI APIs through a unified interface
- React hooks combined with Ink components for terminal rendering management

## Suggestions
- In src/utils/ai.ts, callModel has no retry logic - adding exponential backoff would improve reliability for Ollama which can be slow to start
- The provider configuration system could benefit from validation and error handling for malformed API keys or endpoints
- Consider adding tests for the AI provider abstraction to ensure consistent behavior across different providers

<!--lens-json
{"overview":"Lens is an AI-powered CLI tool built with React and Ink that lets users explore, understand, and modify codebases through natural language. It provides chat functionality, code reviews, commit message generation, and timeline exploration of repositories. The tool connects to multiple LLM providers and gives AI direct access to the filesystem, shell, and web.","importantFolders":["src/commands: Contains chat.tsx, commit.tsx, review.tsx, timeline.tsx - each exports an Ink component that is the top-level renderer for that CLI command","src/utils: Contains ai.ts with callModel abstraction supporting Anthropic/Gemini/Ollama/OpenAI providers via a unified Provider type","src/components: Contains React components for terminal UI rendering using Ink"],"tooling":{"packageManager":"bun","language":"TypeScript","runtime":"Node.js","bundler":"tsup","framework":"React + Ink"},"keyFiles":["src/utils/ai.ts: callModel abstraction supporting anthropic/gemini/ollama/openai providers via a unified Provider type","src/commands/chat.tsx: Main chat interface component with session management","src/commands/commit.tsx: Commit message generation from staged changes","src/commands/review.tsx: Code review functionality for repositories","src/commands/timeline.tsx: Commit history exploration interface"],"patterns":["Discriminated union state machines (type + stage fields) for multi-step UI flows in every command component","Provider abstraction pattern in ai.ts that handles multiple AI APIs through a unified interface","React hooks combined with Ink components for terminal rendering management"],"architecture":"The system uses a command-based architecture where each major feature (chat, review, commit, timeline) is implemented as a separate command component. These components use React with Ink for terminal rendering and manage complex multi-step interactions through state machines. The AI provider system in src/utils/ai.ts provides a unified interface to multiple LLM APIs, while the tool system allows the AI to interact with the filesystem and execute commands.","suggestions":["In src/utils/ai.ts, callModel has no retry logic - adding exponential backoff would improve reliability for Ollama which can be slow to start","The provider configuration system could benefit from validation and error handling for malformed API keys or endpoints","Consider adding tests for the AI provider abstraction to ensure consistent behavior across different providers"],"generatedAt":"2026-03-24T12:54:30.944Z","lastUpdated":"2026-03-24T12:54:30.944Z"}
lens-json-->
