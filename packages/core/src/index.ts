// agent
export { chat } from "./agent";

// session
export { createSession, addMessage, getMessages } from "./session";
export type { Session } from "./session";

// memory
export {
  getSystemPrompt,
  loadSession,
  saveSession,
  loadGlobalMemory,
  saveGlobalMemory,
  getLatestSession,
} from "./memory";

// config
export {
  loadConfig,
  saveConfig,
  configExists,
  getActiveProvider,
  setActiveProvider,
  addProvider,
} from "./config";
export type { Config, Provider, ProviderSettings } from "./config";

// tools
export { tools, read, write, bash, grep, ls, remember } from "./tools";

// providers
export { createProvider, getActiveModelName } from "./providers";
