# Lens
> Generated: 2026-03-24T15:21:42.840Z

## Overview
Lens is an AI-powered CLI tool built with React and Ink that enables natural language interaction with codebases. It provides chat-based exploration, code modification, repository analysis, timeline viewing, and smart commit generation. The tool connects to multiple LLM providers (Anthropic, OpenAI, Gemini, Ollama) and gives AI access to filesystem operations, shell commands, and web tools through a plugin system.

## Architecture
The architecture follows a command-based structure with Ink components for terminal UI rendering. Each CLI command (chat, commit, review, task, timeline) has a corresponding React component in src/commands/ that handles the specific workflow. The system uses discriminated union types for state management across multi-step processes. Tool execution is managed through a centralized registry system that supports plugins via @ridit/lens-sdk.

## Tooling & Conventions
- **packageManager**: bun
- **language**: TypeScript
- **runtime**: Node.js
- **bundler**: bun build
- **framework**: Ink + React
- **testRunner**: jest (configured but not actively used)
- **linter**: TypeScript compiler with strict settings

## Important Folders
- src/commands: Contains CLI command entry points (chat.tsx, commit.tsx, review.tsx, task.tsx, timeline.tsx) that render Ink components
- src/components: Houses reusable UI components organized by feature (chat/, repo/, timeline/, task/) with associated hooks
- src/utils: Core utilities including AI integration (ai.ts), configuration management (config.ts), git operations (git.ts), and tool registry (tools/)
- src/tools: Filesystem, shell, web, and PDF tools that the AI can call through the tool registry system

## Key Files
- src/index.tsx: Main CLI entry point that sets up Commander.js with all command handlers and loads built-in tools
- src/utils/tools/registry.ts: Central tool registry implementing the @ridit/lens-sdk interface for tool management and system prompt generation
- src/utils/ai.ts: Provider-agnostic AI integration with support for Anthropic, OpenAI, Ollama, and custom providers through unified interfaces
- src/types/chat.ts: Core type definitions for chat messages, tool calls, and state management using discriminated unions
- src/components/chat/ChatRunner.tsx: Main chat interface component handling tool execution, permission prompts, and clone operations

## Patterns & Idioms
- Discriminated union state machines (type + stage fields) for multi-step UI flows in every command component (ChatStage, AnalysisStage, etc)
- Centralized tool registry pattern with plugin system support through @ridit/lens-sdk interface
- Provider abstraction layer that supports multiple LLM backends with consistent interfaces
- File-based memory system that persists chat history and context across sessions per repository
- Ink component composition with hooks for input handling and state management

## Suggestions
- In src/utils/ai.ts, callModel has no retry logic — adding exponential backoff would improve reliability for ollama which can be slow to start
- The tool registry in src/utils/tools/registry.ts lacks validation for tool name conflicts during registration
- src/utils/git.ts uses simple execSync for git operations which could benefit from proper error handling and timeout management
- The discriminated union types in src/types/chat.ts could use branded types for better type safety
- The build process in package.json uses a postbuild script to add node shebang which could be replaced with bun's native --target=binary option

<!--lens-json
{"overview":"Lens is an AI-powered CLI tool built with React and Ink that enables natural language interaction with codebases. It provides chat-based exploration, code modification, repository analysis, timeline viewing, and smart commit generation. The tool connects to multiple LLM providers (Anthropic, OpenAI, Gemini, Ollama) and gives AI access to filesystem operations, shell commands, and web tools through a plugin system.","importantFolders":["src/commands: Contains CLI command entry points (chat.tsx, commit.tsx, review.tsx, task.tsx, timeline.tsx) that render Ink components","src/components: Houses reusable UI components organized by feature (chat/, repo/, timeline/, task/) with associated hooks","src/utils: Core utilities including AI integration (ai.ts), configuration management (config.ts), git operations (git.ts), and tool registry (tools/)","src/tools: Filesystem, shell, web, and PDF tools that the AI can call through the tool registry system"],"tooling":{"packageManager":"bun","language":"TypeScript","runtime":"Node.js","bundler":"bun build","framework":"Ink + React","testRunner":"jest (configured but not actively used)","linter":"TypeScript compiler with strict settings"},"keyFiles":["src/index.tsx: Main CLI entry point that sets up Commander.js with all command handlers and loads built-in tools","src/utils/tools/registry.ts: Central tool registry implementing the @ridit/lens-sdk interface for tool management and system prompt generation","src/utils/ai.ts: Provider-agnostic AI integration with support for Anthropic, OpenAI, Ollama, and custom providers through unified interfaces","src/types/chat.ts: Core type definitions for chat messages, tool calls, and state management using discriminated unions","src/components/chat/ChatRunner.tsx: Main chat interface component handling tool execution, permission prompts, and clone operations"],"patterns":["Discriminated union state machines (type + stage fields) for multi-step UI flows in every command component (ChatStage, AnalysisStage, etc)","Centralized tool registry pattern with plugin system support through @ridit/lens-sdk interface","Provider abstraction layer that supports multiple LLM backends with consistent interfaces","File-based memory system that persists chat history and context across sessions per repository","Ink component composition with hooks for input handling and state management"],"architecture":"The architecture follows a command-based structure with Ink components for terminal UI rendering. Each CLI command (chat, commit, review, task, timeline) has a corresponding React component in src/commands/ that handles the specific workflow. The system uses discriminated union types for state management across multi-step processes. Tool execution is managed through a centralized registry system that supports plugins via @ridit/lens-sdk.","suggestions":["In src/utils/ai.ts, callModel has no retry logic — adding exponential backoff would improve reliability for ollama which can be slow to start","The tool registry in src/utils/tools/registry.ts lacks validation for tool name conflicts during registration","src/utils/git.ts uses simple execSync for git operations which could benefit from proper error handling and timeout management","The discriminated union types in src/types/chat.ts could use branded types for better type safety","The build process in package.json uses a postbuild script to add node shebang which could be replaced with bun's native --target=binary option"],"generatedAt":"2026-03-24T15:21:42.840Z","lastUpdated":"2026-03-24T15:21:42.840Z"}
lens-json-->
