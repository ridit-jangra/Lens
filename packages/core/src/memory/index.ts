// interface Memory {
//     repoId: string       // git root commit hash
//     summary: string      // what lens knows about this repo
//     files: FileMemory[]  // per-file summaries
//     updatedAt: Date
//   }

//   interface FileMemory {
//     path: string
//     summary: string      // what this file does
//     exports: string[]    // what it exports
//   }

//   // populated by /init command
//   // injected into system prompt automatically
//   getMemory(cwd: string) → Memory | null
//   saveMemory(memory: Memory) → void
