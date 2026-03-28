import { streamText } from "ai";
import type { CoreMessage } from "ai";
import { createProvider } from "../providers";
import { getActiveModelName } from "../providers";
import { tools } from "../tools";

interface AgentOptions {
  messages: CoreMessage[];
  system?: string;
  maxSteps?: number;
  onChunk?: (chunk: string) => void;
  onBeforeToolCall?: (tool: string, args: unknown) => Promise<boolean>;
  onToolCall?: (tool: string, args: unknown) => void;
  onToolResult?: (tool: string, result: unknown) => void;
  onFinish?: (text: string, responseMessages: CoreMessage[], model: string) => void;
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
              if (!approved) return "Permission denied. Do not call any more tools. Respond with text only, telling the user what action requires their permission.";
              return (t as { execute: (a: unknown, o: unknown) => unknown }).execute(args, opts);
            },
          },
        ]),
      )
    : tools;

  // accumulate all response messages across steps (tool calls + final text)
  const responseMessages: CoreMessage[] = [];

  const result = streamText({
    model: createProvider(),
    tools: activeTools as typeof tools,
    messages: options.messages,
    system: options.system,
    maxSteps: options.maxSteps ?? 50,
    onStepFinish: (step) => {
      responseMessages.push(...(step.response.messages as CoreMessage[]));
      for (const toolResult of step.toolResults) {
        options.onToolCall?.(toolResult.toolName, toolResult.args);
        options.onToolResult?.(toolResult.toolName, toolResult.result);
      }
    },
  });

  for await (const chunk of result.textStream) {
    options.onChunk?.(chunk);
  }

  options.onFinish?.(await result.text, responseMessages, getActiveModelName());
}
