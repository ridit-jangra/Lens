import { streamText } from "ai";
import { createProvider } from "./providers";
import { tools } from "./tools";

const result = streamText({
  model: createProvider(),
  tools,
  maxSteps: 10,
  prompt:
    "list all files in the src directory, then read the config/index.ts file and explain it",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
