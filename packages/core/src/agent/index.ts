import { streamText } from "ai";
import type { CoreMessage } from "ai";
import { createProvider } from "../providers";
import { tools } from "../tools";

interface AgentOptions {
  messages: CoreMessage[];
  onChunk?: (chunk: string) => void;
  onToolCall?: (tool: string, args: unknown) => void;
  onToolResult?: (tool: string, result: unknown) => void;
  onFinish?: (text: string) => void;
}

export async function chat(options: AgentOptions) {
  const result = streamText({
    model: createProvider(),
    tools,
    messages: options.messages,
    maxSteps: 50,
    onStepFinish: (step) => {
      for (const toolResult of step.toolResults) {
        options.onToolCall?.(toolResult.toolName, toolResult.args);
        options.onToolResult?.(toolResult.toolName, toolResult.result);
      }
    },
  });

  for await (const chunk of result.textStream) {
    options.onChunk?.(chunk);
  }

  options.onFinish?.(await result.text);
}
