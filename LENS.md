# Lens - Codebase Intelligence Tool

Lens is a CLI tool that helps developers understand, navigate, and interact with codebases using AI-powered analysis.

## Core Features

- **Repository Analysis**: Analyze both local and remote repositories
- **AI-Powered Insights**: Uses LLMs to understand code structure and content
- **Interactive Chat**: Converse with your codebase using natural language
- **Code Review**: Automated code reviews with specific suggestions
- **Timeline Exploration**: Explore commit history and code evolution
- **Task Automation**: Apply natural language changes to codebases

## Supported AI Providers

- Anthropic
- Gemini (Google AI)
- OpenAI
- Ollama (local models)
- Custom endpoints

## Technical Architecture

- Built with React components rendered in terminal via Ink
- TypeScript throughout for type safety
- Bun as build tool and runtime
- Commander.js for CLI structure
- Modular command system with separate handlers

## Commands

- `lens repo <url>` - Analyze a remote repository
- `lens review [path]` - Review a local codebase
- `lens task <text>` - Apply natural language changes
- `lens chat` - Interactive chat with codebase
- `lens timeline` - Explore commit history
- `lens provider` - Configure AI providers

## Key Components

- **Smart File Selection**: AI determines which files are most important
- **Structured Analysis**: Provides overviews, folder insights, and suggestions
- **Security Scanning**: Identifies potential security issues
- **Multi-Model Support**: Flexible AI backend configuration

## Installation

```bash
npm install -g @ridit/lens
```

## Usage

```bash
# Analyze a GitHub repository
lens repo https://github.com/user/repo

# Review local codebase
lens review .

# Chat with your code
lens chat --path .

# Make changes with natural language
lens task "Add TypeScript types to this component" --path .
```

Lens helps developers quickly understand complex codebases through AI-assisted analysis and natural language interaction.