import { streamText } from "ai";
import type { CoreMessage } from "ai";
import { createProvider } from "../providers";
import { tools } from "../tools";

interface AgentOptions {
  messages: CoreMessage[];
  system?: string;
  onChunk?: (chunk: string) => void;
  onBeforeToolCall?: (tool: string, args: unknown) => Promise<boolean>;
  onToolCall?: (tool: string, args: unknown) => void;
  onToolResult?: (tool: string, result: unknown) => void;
  onFinish?: (text: string) => void;
}

export async function chat(options: AgentOptions) {
  const activeTools = options.onBeforeToolCall
    ? Object.fromEntries(
        Object.entries(tools).map(([name, t]) => [
          name,
          {
            ...t,
            execute: async (args: unknown, opts: unknown) => {
              const approved = await options.onBeforeToolCall!(name, args);
              if (!approved) return "Tool call denied by user.";
              return (t as { execute: (a: unknown, o: unknown) => unknown }).execute(args, opts);
            },
          },
        ]),
      )
    : tools;

  const result = streamText({
    model: createProvider(),
    tools: activeTools as typeof tools,
    messages: options.messages,
    system: options.system,
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
