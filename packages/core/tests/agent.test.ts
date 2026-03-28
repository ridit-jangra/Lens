import { describe, it, expect, mock } from "bun:test";

// Mock the AI SDK and provider before importing the agent
const mockTextStream = async function* () {
  yield "Hello";
  yield ", world";
  yield "!";
};

const mockStreamText = mock(() => ({
  textStream: mockTextStream(),
  text: Promise.resolve("Hello, world!"),
  steps: [],
}));

mock.module("ai", () => ({
  streamText: mockStreamText,
  tool: (config: unknown) => config, // passthrough — tools.test.ts needs this export
}));

mock.module("../src/providers", () => ({
  createProvider: mock(() => "mock-model"),
  getActiveModelName: mock(() => "mock-model"),
}));

const { chat } = await import("../src/agent/index.ts");

describe("chat", () => {
  it("fires onChunk for each streamed token", async () => {
    const chunks: string[] = [];

    await chat({
      messages: [{ role: "user", content: "hi" }],
      onChunk: (c) => chunks.push(c),
    });

    expect(chunks).toEqual(["Hello", ", world", "!"]);
  });

  it("fires onFinish with the complete text", async () => {
    let finished = "";

    await chat({
      messages: [{ role: "user", content: "hi" }],
      onFinish: (text) => { finished = text; },
    });

    expect(finished).toBe("Hello, world!");
  });

  it("passes system prompt to streamText", async () => {
    mockStreamText.mockReturnValueOnce({
      textStream: (async function* () { yield "ok"; })(),
      text: Promise.resolve("ok"),
      steps: [],
    });

    await chat({
      messages: [],
      system: "You are a test assistant.",
    });

    const call = mockStreamText.mock.calls.at(-1)?.[0] as { system?: string };
    expect(call?.system).toBe("You are a test assistant.");
  });

  it("passes messages to streamText", async () => {
    mockStreamText.mockReturnValueOnce({
      textStream: (async function* () { yield "ok"; })(),
      text: Promise.resolve("ok"),
      steps: [],
    });

    const messages = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "hi" },
    ];

    await chat({ messages });

    const call = mockStreamText.mock.calls.at(-1)?.[0] as { messages: unknown };
    expect(call?.messages).toEqual(messages);
  });
});
