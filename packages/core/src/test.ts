import { chat } from "./agent";
import { createSession, addMessage, getMessages } from "./session";

let session = createSession(process.cwd());
session = addMessage(
  session,
  "user",
  "list files in src and explain what each folder does",
);

await chat({
  messages: getMessages(session),
  onChunk: (chunk) => process.stdout.write(chunk),
  onToolCall: (tool, args) => console.log(`\n⟩ ${tool}`, args),
  onFinish: (text) => {
    session = addMessage(session, "assistant", text);
  },
});
