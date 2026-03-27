import { streamText } from "ai";
import { createProvider } from "./providers";
import { read } from "./tools/read";

const result = await streamText({
  model: createProvider(),
  tools: { read },
  maxSteps: 5,
  prompt: "read the file src/config/index.ts and explain what it does",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
