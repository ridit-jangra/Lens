export type ProviderType =
  | "anthropic"
  | "gemini"
  | "openai"
  | "ollama"
  | "custom";

export type Provider = {
  id: string;
  type: ProviderType;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
};

export type Config = {
  providers: Provider[];
  defaultProviderId?: string;
};
