// interface Message {
//     id: string
//     role: "user" | "assistant"
//     content: string
//     toolCalls?: ToolCall[]
//     createdAt: Date
//   }

//   interface Session {
//     id: string
//     cwd: string          // which repo
//     messages: Message[]
//     createdAt: Date
//   }

//   createSession(cwd: string) → Session
//   addMessage(session, role, content) → Session
//   getSession(id: string) → Session
