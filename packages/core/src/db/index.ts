// // ~/.lens/lens.db
// // tables:
// // - repos     (id, path, createdAt)
// // - sessions  (id, repoId, createdAt)
// // - messages  (id, sessionId, role, content, createdAt)
// // - memories  (id, repoId, summary, updatedAt)
// // - files     (id, repoId, path, summary, updatedAt)
// ```

// ---

// **how it all connects:**
// ```
// user types prompt
//   → session.addMessage(user, prompt)
//   → agent.runAgent({ messages, callbacks })
//     → createProvider() → streamText({ tools })
//       → AI decides to call read("auth.ts")
//         → tool executes → returns file contents
//         → AI continues with context
//       → AI streams response
//         → onChunk() → TUI renders tokens
//     → session.addMessage(assistant, response)
//     → db.saveSession()
