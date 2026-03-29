import { streamText, tool } from "ai";
import type { CoreMessage } from "ai";
import { readFileSync, existsSync } from "fs";
import { z } from "zod";
import { createProvider } from "../providers";
import { getActiveModelName } from "../providers";
import { getActiveProvider } from "../config";
import { tools } from "../tools";

interface AgentOptions {
  messages: CoreMessage[];
  system?: string;
  runtimeTools?: string;
  maxSteps?: number;
  onChunk?: (chunk: string) => void;
  onBeforeToolCall?: (tool: string, args: unknown) => Promise<boolean>;
  onToolCall?: (tool: string, args: unknown) => void;
  onToolResult?: (tool: string, result: unknown) => void;
  onFinish?: (
    text: string,
    responseMessages: CoreMessage[],
    model: string,
  ) => void;
}

function buildZodSchema(
  parameters: Record<string, { type: string; description?: string }>,
) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, val] of Object.entries(parameters)) {
    let field: z.ZodTypeAny;
    if (val.type === "number") field = z.number();
    else if (val.type === "boolean") field = z.boolean();
    else field = z.string();
    if (val.description) field = field.describe(val.description);
    shape[key] = field;
  }
  return z.object(shape);
}

export async function chat(options: AgentOptions) {
  let extraTools: Record<string, any> = {};
  if (options.runtimeTools && existsSync(options.runtimeTools)) {
    const raw = JSON.parse(
      readFileSync(options.runtimeTools, "utf-8"),
    ) as Array<{
      name: string;
      description: string;
      parameters?: Record<string, { type: string; description?: string }>;
      endpoint: string;
    }>;
    for (const t of raw) {
      extraTools[t.name] = tool({
        description: t.description,
        parameters: buildZodSchema(t.parameters ?? {}),
        execute: async (args) => {
          const res = await fetch(t.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(args),
          });
          return await res.json();
        },
      });
    }
  }

  const allTools = { ...tools, ...extraTools };

  const activeTools = options.onBeforeToolCall
    ? Object.fromEntries(
        Object.entries(allTools).map(([name, t]) => [
          name,
          {
            ...t,
            execute: async (args: unknown, opts: unknown) => {
              const approved = await options.onBeforeToolCall!(name, args);
              if (!approved)
                return "Permission denied. Do not call any more tools. Respond with text only, telling the user what action requires their permission.";
              return (
                t as { execute: (a: unknown, o: unknown) => unknown }
              ).execute(args, opts);
            },
          },
        ]),
      )
    : allTools;

  // accumulate all response messages across steps (tool calls + final text)
  const responseMessages: CoreMessage[] = [];

  const providerSettings = (() => {
    try {
      return getActiveProvider();
    } catch {
      return null;
    }
  })();

  const result = streamText({
    model: createProvider(),
    tools: activeTools as unknown as typeof tools,
    messages: options.messages,
    system: options.system,
    maxSteps: options.maxSteps ?? 50,
    ...(providerSettings?.maxTokens !== undefined && {
      maxTokens: providerSettings.maxTokens,
    }),
    ...(providerSettings?.temperature !== undefined && {
      temperature: providerSettings.temperature,
    }),
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
