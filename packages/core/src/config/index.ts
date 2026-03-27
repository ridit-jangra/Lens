interface Config {
  provider: "anthropic" | "openai" | "google" | "groq";
  model?: string;
  apiKey: string;
  baseURL?: string;
}

// stored at ~/.lens/config.json
// functions:
// loadConfig() → LensConfig
// saveConfig(config) → void
// configExists() → boolean
