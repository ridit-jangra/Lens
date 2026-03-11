import type { Provider } from "../types/config";

type Message = { role: "user" | "assistant"; content: string };

export async function runPrompt(
  provider: Provider,
  prompt: string,
): Promise<string> {
  if (provider.type === "anthropic") {
    return runAnthropic(provider, prompt);
  }
  if (provider.type === "openai" || provider.type === "custom") {
    return runOpenAICompat(provider, prompt);
  }
  if (provider.type === "ollama") {
    return runOllama(provider, prompt);
  }
  throw new Error(`Unknown provider type: ${provider.type}`);
}

async function runAnthropic(
  provider: Provider,
  prompt: string,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.statusText}`);
  const data = (await res.json()) as any;
  return data.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
}

async function runOpenAICompat(
  provider: Provider,
  prompt: string,
): Promise<string> {
  const baseUrl = provider.baseUrl ?? "https://api.openai.com/v1";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey ?? ""}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.statusText}`);
  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content ?? "";
}

async function runOllama(provider: Provider, prompt: string): Promise<string> {
  const baseUrl = provider.baseUrl ?? "http://localhost:11434";
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      stream: false,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.statusText}`);
  const data = (await res.json()) as any;
  return data.message?.content ?? "";
}
