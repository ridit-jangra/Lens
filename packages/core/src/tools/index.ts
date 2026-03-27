// each tool follows same pattern:
// tool({
//     description: string     // what the AI reads to decide when to use it
//     parameters: z.object()  // zod schema
//     execute: async (args) → result
//   })

// read.ts    → read file contents or list dir
// write.ts   → write/overwrite a file
// bash.ts    → run shell command, return output (30s timeout)
// grep.ts    → search pattern in files, return matches
// ls.ts      → list directory contents
// git.ts     → git status, diff, log, commit
// fetch.ts   → fetch a URL, return text/json
// agent.ts   → spawn subagent with its own prompt + tools
