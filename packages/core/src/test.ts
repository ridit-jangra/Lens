import { chat } from "./agent";
import { createSession, addMessage, getMessages } from "./session";
import { getSystemPrompt, loadSession, saveSession } from "./memory";

const cwd = process.cwd();

// load existing session or create new one
let session = loadSession(cwd) ?? createSession(cwd);

session = addMessage(session, "user", "what do i prefer over everything?");

await chat({
  messages: getMessages(session),
  system: getSystemPrompt(cwd),
  onChunk: (chunk) => process.stdout.write(chunk),
  onToolCall: (tool, args) => console.log(`\n⟩ ${tool}`, args),
  onFinish: (text) => {
    session = addMessage(session, "assistant", text);
    saveSession(session);
  },
});
