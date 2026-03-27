// interface AgentOptions {
//   messages: Message[]
//   onChunk?: (chunk: string) => void        // streaming text
//   onToolCall?: (tool, args) => void        // tool started
//   onToolResult?: (tool, result) => void    // tool finished
//   onFinish?: (text: string) => void        // done
// }

// internally:
// 1. loadConfig() → createProvider()
// 2. streamText({ model, tools, messages, maxSteps: 50 })
// 3. fires callbacks for TUI to render
// runAgent(options: AgentOptions) → AsyncGenerator
