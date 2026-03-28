import type { LanguageModel } from "ai";
import { getActiveProvider } from "../config";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// default models per provider:
// anthropic → claude-sonnet-4-5
// openai    → gpt-4o
// google    → gemini-2.0-flash
// groq      → openai/gpt-oss-120b
// custom    → whatever model is in activeProvider

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4.5";
const DEFAULT_OPENAI_MODEL = "gpt-4o";
const DEFAULT_GOOGLE_MODEL = "gemini-2.0-flash";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-oss-120b:free";

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: DEFAULT_ANTHROPIC_MODEL,
  openai: DEFAULT_OPENAI_MODEL,
  google: DEFAULT_GOOGLE_MODEL,
  groq: DEFAULT_GROQ_MODEL,
  openrouter: DEFAULT_OPENROUTER_MODEL,
};

export function getActiveModelName(): string {
  const { provider, model } = getActiveProvider();
  return model ?? DEFAULT_MODELS[provider] ?? provider;
}

// reads activeProvider internally
// returns correct LanguageModel instance
export function createProvider(): LanguageModel {
  const activeProvider = getActiveProvider();

  switch (activeProvider.provider) {
    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey: activeProvider.apiKey,
        baseURL: activeProvider.baseURL,
      });
      return anthropic(activeProvider.model ?? DEFAULT_ANTHROPIC_MODEL);
    }
    case "openai": {
      const openai = createOpenAI({
        apiKey: activeProvider.apiKey,
        baseURL: activeProvider.baseURL,
      });
      return openai(activeProvider.model ?? DEFAULT_OPENAI_MODEL);
    }
    case "google": {
      const google = createGoogleGenerativeAI({
        apiKey: activeProvider.apiKey,
        baseURL: activeProvider.baseURL,
      });
      return google(activeProvider.model ?? DEFAULT_GOOGLE_MODEL);
    }
    case "groq": {
      const groq = createGroq({
        apiKey: activeProvider.apiKey,
        baseURL: activeProvider.baseURL,
      });
      return groq(activeProvider.model ?? DEFAULT_GROQ_MODEL);
    }
    case "openrouter": {
      const openrouter = createOpenAI({
        apiKey: activeProvider.apiKey,
        baseURL:
          activeProvider.baseURL ??
          "https://openrouter.ai/api/v1/chat/completions",
      });
      return openrouter(activeProvider.model ?? DEFAULT_GROQ_MODEL);
    }
  }
}
