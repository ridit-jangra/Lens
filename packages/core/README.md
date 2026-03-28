# @ridit/lens-core

Internal backend package for [Lens](https://github.com/ridit-jangra/Lens). Handles the AI agent, tool execution, session management, provider configuration, and memory.

## Modules

### Agent

```ts
import { chat } from "@ridit/lens-core";

await chat({
  messages,
  system,
  maxSteps,          // default 50
  onChunk,           // called with each streamed text chunk
  onBeforeToolCall,  // return false to deny a tool call
  onToolCall,        // called after each tool completes (with args)
  onToolResult,      // called after each tool completes (with result)
  onFinish,          // called with full text, response messages, model name
});
```

### Tools

Available tools passed to `streamText`: `read`, `write`, `bash`, `grep`, `ls`, `remember`, `del`, `search`, `scrape`.

```ts
import { tools } from "@ridit/lens-core";
```

### Config

Provider config stored at `~/.lens/config.json`.

```ts
import { addProvider, setActiveProvider, getActiveProvider, getConfiguredProviders } from "@ridit/lens-core";
import type { Provider, ProviderSettings } from "@ridit/lens-core";

// Providers: "anthropic" | "openai" | "google" | "groq" | "openrouter" | "ollama" | "custom"
addProvider("anthropic", { apiKey: "...", model: "claude-sonnet-4-5" });
setActiveProvider("anthropic");

const { provider, apiKey, model, maxTokens, temperature } = getActiveProvider();
```

### Session & Memory

```ts
import { createSession, addMessage, getMessages, appendMessages } from "@ridit/lens-core";
import { loadSession, saveSession, getLatestSession, getSystemPrompt } from "@ridit/lens-core";

const session = createSession();
const system = getSystemPrompt("/path/to/repo"); // injects LENS.md + global memory
```

Sessions are saved to `~/.lens/memory/{id}.json`.

### Providers

```ts
import { createProvider, getActiveModelName } from "@ridit/lens-core";

const model = createProvider(); // returns Vercel AI SDK LanguageModel
const name = getActiveModelName();
```

## License

MIT
