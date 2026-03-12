import { execSync } from "child_process";

export type Commit = {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  relativeDate: string;
  message: string;
  body: string;
  refs: string;
  parents: string[];
  filesChanged: number;
  insertions: number;
  deletions: number;
};

export type DiffFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  insertions: number;
  deletions: number;
  lines: { type: "add" | "remove" | "context" | "header"; content: string }[];
};

function run(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

export function isGitRepo(p: string): boolean {
  return run("git rev-parse --is-inside-work-tree", p) === "true";
}

export function fetchCommits(repoPath: string, limit = 200): Commit[] {
  const SEP = "|||";
  const RS = "^^^";
  const raw = run(
    `git log --max-count=${limit} --format="${RS}%H${SEP}%h${SEP}%an${SEP}%ae${SEP}%ci${SEP}%cr${SEP}%s${SEP}%b${SEP}%D${SEP}%P" --shortstat`,
    repoPath,
  );
  if (!raw) return [];

  return raw
    .split(RS)
    .filter(Boolean)
    .flatMap((block) => {
      const lines = block.split("\n");
      const parts = lines[0]!.split(SEP);
      if (parts.length < 10) return [];
      const [
        hash,
        shortHash,
        author,
        email,
        date,
        relativeDate,
        message,
        body,
        refs,
        parentsRaw,
      ] = parts;
      const statLine = lines.find((l) => l.includes("changed")) ?? "";
      return [
        {
          hash: hash!.trim(),
          shortHash: shortHash!.trim(),
          author: author!.trim(),
          email: email!.trim(),
          date: date!.trim(),
          relativeDate: relativeDate!.trim(),
          message: message!.trim(),
          body: body!.trim(),
          refs: refs!.trim(),
          parents: parentsRaw!.trim().split(" ").filter(Boolean),
          filesChanged: parseInt(statLine.match(/(\d+) file/)?.[1] ?? "0"),
          insertions: parseInt(statLine.match(/(\d+) insertion/)?.[1] ?? "0"),
          deletions: parseInt(statLine.match(/(\d+) deletion/)?.[1] ?? "0"),
        },
      ];
    });
}

export function fetchDiff(repoPath: string, hash: string): DiffFile[] {
  const raw = run(
    `git show --unified=3 --diff-filter=ACDMR "${hash}"`,
    repoPath,
  );
  if (!raw) return [];

  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;

  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git")) {
      if (cur) files.push(cur);
      cur = {
        path: "",
        status: "modified",
        insertions: 0,
        deletions: 0,
        lines: [],
      };
    } else if (line.startsWith("+++ b/") && cur) {
      cur.path = line.slice(6);
    } else if (line.startsWith("new file") && cur) {
      cur.status = "added";
    } else if (line.startsWith("deleted file") && cur) {
      cur.status = "deleted";
    } else if (line.startsWith("rename") && cur) {
      cur.status = "renamed";
    } else if (line.startsWith("@@") && cur) {
      cur.lines.push({ type: "header", content: line });
    } else if (line.startsWith("+") && cur && !line.startsWith("+++")) {
      cur.insertions++;
      cur.lines.push({ type: "add", content: line.slice(1) });
    } else if (line.startsWith("-") && cur && !line.startsWith("---")) {
      cur.deletions++;
      cur.lines.push({ type: "remove", content: line.slice(1) });
    } else if (cur && line !== "\\ No newline at end of file") {
      cur.lines.push({ type: "context", content: line.slice(1) });
    }
  }
  if (cur) files.push(cur);
  return files.filter((f) => f.path);
}

export function summarizeTimeline(commits: Commit[]): string {
  if (!commits.length) return "No commits.";
  const authors = [...new Set(commits.map((c) => c.author))];
  const biggest = [...commits].sort(
    (a, b) => b.insertions + b.deletions - (a.insertions + a.deletions),
  )[0]!;
  return [
    `Total commits: ${commits.length}`,
    `Authors: ${authors.join(", ")}`,
    `Newest: "${commits[0]!.message}" (${commits[0]!.shortHash}) — ${commits[0]!.relativeDate}`,
    `Oldest: "${commits[commits.length - 1]!.message}" (${commits[commits.length - 1]!.shortHash}) — ${commits[commits.length - 1]!.relativeDate}`,
    `Biggest change: "${biggest.message}" (${biggest.shortHash}) +${biggest.insertions}/-${biggest.deletions}`,
    ``,
    `Full log (hash | date | author | message | +ins/-del):`,
    ...commits.map(
      (c) =>
        `${c.shortHash} | ${c.date.slice(0, 10)} | ${c.author} | ${c.message} | +${c.insertions}/-${c.deletions}`,
    ),
  ].join("\n");
}
