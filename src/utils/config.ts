import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import os from "os";
import type { Config, Provider } from "../types/config";

const CONFIG_DIR = path.join(os.homedir(), ".lens");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function loadConfig(): Config {
  if (!configExists()) return { providers: [] };
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Config;
  } catch {
    return { providers: [] };
  }
}

export function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function addProvider(provider: Provider): void {
  const config = loadConfig();
  const existing = config.providers.findIndex((p) => p.id === provider.id);
  if (existing >= 0) {
    config.providers[existing] = provider;
  } else {
    config.providers.push(provider);
  }
  if (!config.defaultProviderId) config.defaultProviderId = provider.id;
  saveConfig(config);
}

export function setDefaultProvider(id: string): void {
  const config = loadConfig();
  config.defaultProviderId = id;
  saveConfig(config);
}

export function getDefaultProvider(): Provider | undefined {
  const config = loadConfig();
  return config.providers.find((p) => p.id === config.defaultProviderId);
}

export const DEFAULT_MODELS: Record<string, string[]> = {
  anthropic: [
    "claude-sonnet-4-20250514",
    "claude-opus-4-20250514",
    "claude-haiku-4-5-20251001",
  ],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  ollama: ["llama3", "mistral", "codellama", "phi3"],
  custom: [],
};

export type CustomResult = { apiKey: string; baseUrl: string };
