import { join } from "path";
import { homedir } from "os";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";

export interface ProviderSettings {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export type Provider = "anthropic" | "openai" | "google" | "groq";

export interface Config {
  activeProvider: Provider;
  providers: Partial<Record<Provider, ProviderSettings>>;
}

const CONFIG_DIR = join(homedir(), ".lens");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
// stored at ~/.lens/config.json

// if no config exists, this will be the default
const DEFAULT_CONFIG: Config = {
  activeProvider: "groq",
  providers: {},
};

export function loadConfig(): Config {
  if (!configExists()) {
    mkdirSync(CONFIG_DIR, { recursive: true }); // create .lens folder
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Config;
  return config;
}

export function saveConfig(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config));
}

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function getActiveProvider(): ProviderSettings & { provider: Provider } {
  const config = loadConfig();

  const settings = config.providers[config.activeProvider];

  if (!settings)
    throw new Error(`provider ${config.activeProvider} not configured`);

  return { ...settings, provider: config.activeProvider };
}

export function setActiveProvider(provider: Provider): void {
  if (!configExists()) throw new Error("config.json not found.");

  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Config;

  const newConfig = { ...config, activeProvider: provider } as Config;

  writeFileSync(CONFIG_PATH, JSON.stringify(newConfig));
}

export function addProvider(
  provider: Provider,
  settings: ProviderSettings,
): void {
  const config = loadConfig();

  const newConfig: Config = {
    ...config,
    providers: {
      ...config.providers,
      [provider]: settings,
    },
  };

  saveConfig(newConfig);
}
