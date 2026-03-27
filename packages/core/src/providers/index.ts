import type { LanguageModel } from "ai";
import { getActiveProvider } from "../config";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

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
      return anthropic(activeProvider.model ?? "claude-sonnet-4-5");
    }
    case "openai": {
      const openai = createOpenAI({
        apiKey: activeProvider.apiKey,
        baseURL: activeProvider.baseURL,
      });
      return openai(activeProvider.model ?? "gpt-4o");
    }
    case "google": {
      const google = createGoogleGenerativeAI({
        apiKey: activeProvider.apiKey,
        baseURL: activeProvider.baseURL,
      });
      return google(activeProvider.model ?? "gemini-2.0-flash");
    }
    case "groq": {
      const groq = createOpenAI({
        apiKey: activeProvider.apiKey,
        baseURL: activeProvider.baseURL ?? "https://api.groq.com/openai/v1",
      });
      return groq(activeProvider.model ?? "llama-3.3-70b-versatile");
    }
  }
}

// default models per provider:
// anthropic → claude-sonnet-4-5
// openai    → gpt-4o
// google    → gemini-2.0-flash
// groq      → llama-3.3-70b-versatile
// custom    → whatever model is in activeProvider
