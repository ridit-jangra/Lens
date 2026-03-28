// agent
export { chat } from "./agent";

// session
export { createSession, createSessionWithId, addMessage, appendMessages, getMessages } from "./session";
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
  removeProvider,
  getConfiguredProviders,
} from "./config";
export type { Config, Provider, ProviderSettings } from "./config";

// tools
export { tools, read, write, bash, grep, ls, remember } from "./tools";

// providers
export { createProvider, getActiveModelName } from "./providers";
