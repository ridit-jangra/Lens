import React from "react";
import { Box, Text, Static, useInput } from "ink";
import Spinner from "ink-spinner";
import { useState, useRef } from "react";
import path from "path";
import os from "os";
import { ACCENT } from "../../colors";
import { buildDiffs } from "../repo/DiffViewer";
import { ProviderPicker } from "../repo/ProviderPicker";
import { fetchFileTree, readImportantFiles } from "../../utils/files";
import { startCloneRepo } from "../../utils/repo";
import { useThinkingPhrase } from "../../utils/thinking";
import {
  walkDir,
  readClipboard,
  applyPatches,
  extractGithubUrl,
  toCloneUrl,
  parseCloneTag,
  runShell,
  fetchUrl,
  readFile,
  writeFile,
  buildSystemPrompt,
  parseResponse,
  callChat,
  searchWeb,
} from "../../utils/chat";
import { StaticMessage } from "./ChatMessage";
import {
  PermissionPrompt,
  InputBox,
  ShortcutBar,
  TypewriterText,
  CloneOfferView,
  CloningView,
  CloneExistsView,
  CloneDoneView,
  CloneErrorView,
  PreviewView,
  ViewingFileView,
} from "./ChatOverlays";
import { TimelineRunner } from "../timeline/TimelineRunner";
import type { Provider } from "../../types/config";
import type { Message, ChatStage } from "../../types/chat";
import {
  appendHistory,
  buildHistorySummary,
  clearRepoHistory,
} from "../../utils/history";
import { readLensFile } from "../../utils/lensfile";
import { ReviewCommand } from "../../commands/review";

const COMMANDS = [
  { cmd: "/timeline", desc: "browse commit history" },
  { cmd: "/clear history", desc: "wipe session memory for this repo" },
  { cmd: "/review", desc: "review current codebsae" },
];

function CommandPalette({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (cmd: string) => void;
}) {
  const q = query.toLowerCase();
  const matches = COMMANDS.filter((c) => c.cmd.startsWith(q));
  if (!matches.length) return null;

  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={2}>
      {matches.map((c, i) => {
        const isExact = c.cmd === query;
        return (
          <Box key={i} gap={2}>
            <Text color={isExact ? ACCENT : "white"} bold={isExact}>
              {c.cmd}
            </Text>
            <Text color="gray" dimColor>
              {c.desc}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

export const ChatRunner = ({ repoPath }: { repoPath: string }) => {
  const [stage, setStage] = useState<ChatStage>({ type: "picking-provider" });
  const [committed, setCommitted] = useState<Message[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [pendingMsgIndex, setPendingMsgIndex] = useState<number | null>(null);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [clonedUrls, setClonedUrls] = useState<Set<string>>(new Set());
  const [showTimeline, setShowTimeline] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const inputBuffer = useRef("");
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingPhrase = useThinkingPhrase(stage.type === "thinking");

  const flushBuffer = () => {
    const buf = inputBuffer.current;
    if (!buf) return;
    inputBuffer.current = "";
    setInputValue((v) => v + buf);
  };

  const scheduleFlush = () => {
    if (flushTimer.current !== null) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      flushBuffer();
    }, 16);
  };

  const handleError = (currentAll: Message[]) => (err: unknown) => {
    const errMsg: Message = {
      role: "assistant",
      content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}`,
      type: "text",
    };
    setAllMessages([...currentAll, errMsg]);
    setCommitted((prev) => [...prev, errMsg]);
    setStage({ type: "idle" });
  };

  const processResponse = (raw: string, currentAll: Message[]) => {
    const parsed = parseResponse(raw);

    if (parsed.kind === "changes") {
      if (parsed.patches.length === 0) {
        const msg: Message = {
          role: "assistant",
          content: parsed.content,
          type: "text",
        };
        setAllMessages([...currentAll, msg]);
        setCommitted((prev) => [...prev, msg]);
        setStage({ type: "idle" });
        return;
      }
      const assistantMsg: Message = {
        role: "assistant",
        content: parsed.content,
        type: "plan",
        patches: parsed.patches,
        applied: false,
      };
      const withAssistant = [...currentAll, assistantMsg];
      setAllMessages(withAssistant);
      setPendingMsgIndex(withAssistant.length - 1);
      const diffLines = buildDiffs(repoPath, parsed.patches);
      setStage({
        type: "preview",
        patches: parsed.patches,
        diffLines,
        scrollOffset: 0,
        pendingMessages: currentAll,
      });
      return;
    }

    if (
      parsed.kind === "shell" ||
      parsed.kind === "fetch" ||
      parsed.kind === "read-file" ||
      parsed.kind === "write-file" ||
      parsed.kind === "search"
    ) {
      let tool: Parameters<typeof PermissionPrompt>[0]["tool"];
      if (parsed.kind === "shell") {
        tool = { type: "shell", command: parsed.command };
      } else if (parsed.kind === "fetch") {
        tool = { type: "fetch", url: parsed.url };
      } else if (parsed.kind === "read-file") {
        tool = { type: "read-file", filePath: parsed.filePath };
      } else if (parsed.kind === "search") {
        tool = { type: "search", query: parsed.query };
      } else {
        tool = {
          type: "write-file",
          filePath: parsed.filePath,
          fileContent: parsed.fileContent,
        };
      }

      if (parsed.content) {
        const preambleMsg: Message = {
          role: "assistant",
          content: parsed.content,
          type: "text",
        };
        setAllMessages([...currentAll, preambleMsg]);
        setCommitted((prev) => [...prev, preambleMsg]);
      }

      setStage({
        type: "permission",
        tool,
        pendingMessages: currentAll,
        resolve: async (approved: boolean) => {
          let result = "(denied by user)";
          if (approved) {
            try {
              setStage({ type: "thinking" });
              if (parsed.kind === "shell") {
                result = await runShell(parsed.command, repoPath);
              } else if (parsed.kind === "fetch") {
                result = await fetchUrl(parsed.url);
              } else if (parsed.kind === "read-file") {
                result = readFile(parsed.filePath, repoPath);
              } else if (parsed.kind === "write-file") {
                result = writeFile(
                  parsed.filePath,
                  parsed.fileContent,
                  repoPath,
                );
              } else if (parsed.kind === "search") {
                result = await searchWeb(parsed.query);
              }
            } catch (err: unknown) {
              result = `Error: ${err instanceof Error ? err.message : "failed"}`;
            }
          }

          if (approved && !result.startsWith("Error:")) {
            const kindMap = {
              shell: "shell-run",
              fetch: "url-fetched",
              "read-file": "file-read",
              "write-file": "file-written",
              search: "url-fetched",
            } as const;
            appendHistory({
              kind: kindMap[parsed.kind as keyof typeof kindMap] ?? "shell-run",
              detail:
                parsed.kind === "shell"
                  ? parsed.command
                  : parsed.kind === "fetch"
                    ? parsed.url
                    : parsed.kind === "search"
                      ? parsed.query
                      : parsed.filePath,
              summary: result.split("\n")[0]?.slice(0, 120) ?? "",
              repoPath,
            });
          }

          const toolName =
            parsed.kind === "shell"
              ? "shell"
              : parsed.kind === "fetch"
                ? "fetch"
                : parsed.kind === "read-file"
                  ? "read-file"
                  : parsed.kind === "search"
                    ? "search"
                    : "write-file";

          const toolContent =
            parsed.kind === "shell"
              ? parsed.command
              : parsed.kind === "fetch"
                ? parsed.url
                : parsed.kind === "search"
                  ? parsed.query
                  : parsed.filePath;

          const toolMsg: Message = {
            role: "assistant",
            type: "tool",
            toolName,
            content: toolContent,
            result,
            approved,
          };

          const withTool = [...currentAll, toolMsg];
          setAllMessages(withTool);
          setCommitted((prev) => [...prev, toolMsg]);

          setStage({ type: "thinking" });
          callChat(provider!, systemPrompt, withTool)
            .then((r: string) => processResponse(r, withTool))
            .catch(handleError(withTool));
        },
      });
      return;
    }

    if (parsed.kind === "clone") {
      if (parsed.content) {
        const preambleMsg: Message = {
          role: "assistant",
          content: parsed.content,
          type: "text",
        };
        setAllMessages([...currentAll, preambleMsg]);
        setCommitted((prev) => [...prev, preambleMsg]);
      }
      setStage({
        type: "clone-offer",
        repoUrl: parsed.repoUrl,
        launchAnalysis: true,
      });
      return;
    }

    const msg: Message = {
      role: "assistant",
      content: parsed.content,
      type: "text",
    };
    const withMsg = [...currentAll, msg];
    setAllMessages(withMsg);
    setCommitted((prev) => [...prev, msg]);

    const lastUserMsg = [...currentAll]
      .reverse()
      .find((m) => m.role === "user");
    const githubUrl = lastUserMsg
      ? extractGithubUrl(lastUserMsg.content)
      : null;

    if (githubUrl && !clonedUrls.has(githubUrl)) {
      setTimeout(() => {
        setStage({ type: "clone-offer", repoUrl: githubUrl });
      }, 80);
    } else {
      setStage({ type: "idle" });
    }
  };

  const sendMessage = (text: string) => {
    if (!provider) return;

    if (text.trim().toLowerCase() === "/timeline") {
      setShowTimeline(true);
      return;
    }

    if (text.trim().toLowerCase() === "/review") {
      setShowReview(true);
      return;
    }

    if (text.trim().toLowerCase() === "/clear history") {
      clearRepoHistory(repoPath);
      const clearedMsg: Message = {
        role: "assistant",
        content: "History cleared for this repo.",
        type: "text",
      };
      setCommitted((prev) => [...prev, clearedMsg]);
      setAllMessages((prev) => [...prev, clearedMsg]);
      return;
    }

    const userMsg: Message = { role: "user", content: text, type: "text" };
    const nextAll = [...allMessages, userMsg];
    setCommitted((prev) => [...prev, userMsg]);
    setAllMessages(nextAll);
    setStage({ type: "thinking" });
    callChat(provider, systemPrompt, nextAll)
      .then((raw: string) => processResponse(raw, nextAll))
      .catch(handleError(nextAll));
  };

  useInput((input, key) => {
    if (showTimeline) return;

    if (stage.type === "idle") {
      if (key.ctrl && input === "c") {
        process.exit(0);
        return;
      }

      if (key.tab && inputValue.startsWith("/")) {
        const q = inputValue.toLowerCase();
        const match = COMMANDS.find((c) => c.cmd.startsWith(q));
        if (match) setInputValue(match.cmd);
        return;
      }
      return;
    }

    if (stage.type === "clone-offer") {
      if (input === "y" || input === "Y" || key.return) {
        const { repoUrl } = stage;
        const launch = stage.launchAnalysis ?? false;
        const cloneUrl = toCloneUrl(repoUrl);
        setStage({ type: "cloning", repoUrl });
        startCloneRepo(cloneUrl).then((result) => {
          if (result.done) {
            const repoName =
              cloneUrl
                .split("/")
                .pop()
                ?.replace(/\.git$/, "") ?? "repo";
            const destPath = path.join(os.tmpdir(), repoName);
            const fileCount = walkDir(destPath).length;
            appendHistory({
              kind: "url-fetched",
              detail: repoUrl,
              summary: `Cloned ${repoName} — ${fileCount} files`,
              repoPath,
            });
            setClonedUrls((prev) => new Set([...prev, repoUrl]));
            setStage({
              type: "clone-done",
              repoUrl,
              destPath,
              fileCount,
              launchAnalysis: launch,
            });
          } else if (result.folderExists && result.repoPath) {
            setStage({
              type: "clone-exists",
              repoUrl,
              repoPath: result.repoPath,
            });
          } else {
            setStage({
              type: "clone-error",
              message:
                !result.folderExists && result.error
                  ? result.error
                  : "Clone failed",
            });
          }
        });
        return;
      }
      if (input === "n" || input === "N" || key.escape)
        setStage({ type: "idle" });
      return;
    }

    if (stage.type === "clone-exists") {
      if (input === "y" || input === "Y") {
        const { repoUrl, repoPath: existingPath } = stage;
        const cloneUrl = toCloneUrl(repoUrl);
        setStage({ type: "cloning", repoUrl });
        startCloneRepo(cloneUrl, { forceReclone: true }).then((result) => {
          if (result.done) {
            const fileCount = walkDir(existingPath).length;
            setStage({
              type: "clone-done",
              repoUrl,
              destPath: existingPath,
              fileCount,
            });
          } else {
            setStage({
              type: "clone-error",
              message:
                !result.folderExists && result.error
                  ? result.error
                  : "Clone failed",
            });
          }
        });
        return;
      }
      if (input === "n" || input === "N") {
        const { repoUrl, repoPath: existingPath } = stage;
        const fileCount = walkDir(existingPath).length;
        setStage({
          type: "clone-done",
          repoUrl,
          destPath: existingPath,
          fileCount,
        });
        return;
      }
      return;
    }

    if (stage.type === "clone-done" || stage.type === "clone-error") {
      if (key.return || key.escape) {
        if (stage.type === "clone-done") {
          const repoName = stage.repoUrl.split("/").pop() ?? "repo";

          const summaryMsg: Message = {
            role: "assistant",
            type: "text",
            content: `Cloned **${repoName}** (${stage.fileCount} files) to \`${stage.destPath}\`.\n\nAsk me anything about it — I can read files, explain how it works, or suggest improvements.`,
          };

          const contextMsg: Message = {
            role: "assistant",
            type: "tool",
            toolName: "fetch",
            content: stage.repoUrl,
            result: `Clone complete. Repo: ${repoName}. Local path: ${stage.destPath}. ${stage.fileCount} files. Use read-file with full path e.g. read-file ${stage.destPath}/README.md`,
            approved: true,
          };
          const withClone = [...allMessages, contextMsg, summaryMsg];
          setAllMessages(withClone);
          setCommitted((prev) => [...prev, summaryMsg]);
          setStage({ type: "idle" });
        } else {
          setStage({ type: "idle" });
        }
      }
      return;
    }

    if (stage.type === "cloning") return;

    if (stage.type === "permission") {
      if (input === "y" || input === "Y" || key.return) {
        stage.resolve(true);
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        stage.resolve(false);
        return;
      }
      return;
    }

    if (stage.type === "preview") {
      if (key.upArrow) {
        setStage({
          ...stage,
          scrollOffset: Math.max(0, stage.scrollOffset - 1),
        });
        return;
      }
      if (key.downArrow) {
        setStage({ ...stage, scrollOffset: stage.scrollOffset + 1 });
        return;
      }
      if (key.escape || input === "s" || input === "S") {
        if (pendingMsgIndex !== null) {
          const msg = allMessages[pendingMsgIndex];
          if (msg?.type === "plan") {
            setCommitted((prev) => [...prev, { ...msg, applied: false }]);
            appendHistory({
              kind: "code-skipped",
              detail: msg.patches
                .map((p: { path: string }) => p.path)
                .join(", "),
              summary: `Skipped changes to ${msg.patches.length} file(s)`,
              repoPath,
            });
          }
        }
        setPendingMsgIndex(null);
        setStage({ type: "idle" });
        return;
      }
      if (key.return || input === "a" || input === "A") {
        try {
          applyPatches(repoPath, stage.patches);
          appendHistory({
            kind: "code-applied",
            detail: stage.patches.map((p) => p.path).join(", "),
            summary: `Applied changes to ${stage.patches.length} file(s)`,
            repoPath,
          });
        } catch {
          /* non-fatal */
        }
        if (pendingMsgIndex !== null) {
          const msg = allMessages[pendingMsgIndex];
          if (msg?.type === "plan") {
            const applied: Message = { ...msg, applied: true };
            setAllMessages((prev) =>
              prev.map((m, i) => (i === pendingMsgIndex ? applied : m)),
            );
            setCommitted((prev) => [...prev, applied]);
          }
        }
        setPendingMsgIndex(null);
        setStage({ type: "idle" });
        return;
      }
    }

    if (stage.type === "viewing-file") {
      if (key.upArrow) {
        setStage({
          ...stage,
          scrollOffset: Math.max(0, stage.scrollOffset - 1),
        });
        return;
      }
      if (key.downArrow) {
        setStage({ ...stage, scrollOffset: stage.scrollOffset + 1 });
        return;
      }
      if (key.escape || key.return) {
        setStage({ type: "idle" });
        return;
      }
    }
  });

  const handleProviderDone = (p: Provider) => {
    setProvider(p);
    setStage({ type: "loading" });
    fetchFileTree(repoPath)
      .catch(() => walkDir(repoPath))
      .then((fileTree) => {
        const importantFiles = readImportantFiles(repoPath, fileTree);
        const historySummary = buildHistorySummary(repoPath);
        const lensFile = readLensFile(repoPath);
        const lensContext = lensFile
          ? `

## LENS.md (previous analysis)
${lensFile.overview}

Important folders: ${lensFile.importantFolders.join(", ")}
Suggestions: ${lensFile.suggestions.slice(0, 3).join("; ")}`
          : "";
        setSystemPrompt(
          buildSystemPrompt(importantFiles, historySummary) + lensContext,
        );
        const historyNote = historySummary
          ? "\n\nI have memory of previous actions in this repo."
          : "";
        const lensGreetNote = lensFile
          ? "\n\nFound LENS.md — I have context from a previous analysis of this repo."
          : "";
        const greeting: Message = {
          role: "assistant",
          content: `Welcome to Lens \nCodebase loaded — ${importantFiles.length} files indexed.${historyNote}${lensGreetNote}\nAsk me anything, tell me what to build, share a URL, or ask me to read/write files.\n\nTip: type /timeline to browse commit history.`,
          type: "text",
        };
        setCommitted([greeting]);
        setAllMessages([greeting]);
        setStage({ type: "idle" });
      })
      .catch(() => setStage({ type: "idle" }));
  };

  if (stage.type === "picking-provider")
    return <ProviderPicker onDone={handleProviderDone} />;

  if (stage.type === "loading") {
    return (
      <Box gap={1} marginTop={1}>
        <Text color={ACCENT}>*</Text>
        <Text color={ACCENT}>
          <Spinner />
        </Text>
        <Text color="gray" dimColor>
          indexing codebase…
        </Text>
      </Box>
    );
  }

  if (showTimeline) {
    return (
      <TimelineRunner
        repoPath={repoPath}
        onExit={() => setShowTimeline(false)}
      />
    );
  }

  if (showReview) {
    return (
      <ReviewCommand path={repoPath} onExit={() => setShowReview(false)} />
    );
  }

  if (stage.type === "clone-offer")
    return <CloneOfferView stage={stage} committed={committed} />;
  if (stage.type === "cloning")
    return <CloningView stage={stage} committed={committed} />;
  if (stage.type === "clone-exists")
    return <CloneExistsView stage={stage} committed={committed} />;
  if (stage.type === "clone-done")
    return <CloneDoneView stage={stage} committed={committed} />;
  if (stage.type === "clone-error")
    return <CloneErrorView stage={stage} committed={committed} />;
  if (stage.type === "preview")
    return <PreviewView stage={stage} committed={committed} />;
  if (stage.type === "viewing-file")
    return <ViewingFileView stage={stage} committed={committed} />;

  return (
    <Box flexDirection="column">
      <Static items={committed}>
        {(msg, i) => <StaticMessage key={i} msg={msg} />}
      </Static>

      {stage.type === "thinking" && (
        <Box gap={1}>
          <Text color={ACCENT}>●</Text>
          <TypewriterText text={thinkingPhrase} />
        </Box>
      )}

      {stage.type === "permission" && (
        <PermissionPrompt tool={stage.tool} onDecide={stage.resolve} />
      )}

      {stage.type === "idle" && (
        <Box flexDirection="column">
          {inputValue.startsWith("/") && (
            <CommandPalette
              query={inputValue}
              onSelect={(cmd) => {
                setInputValue(cmd);
              }}
            />
          )}
          <InputBox
            value={inputValue}
            onChange={setInputValue}
            onSubmit={(val) => {
              if (val.trim()) sendMessage(val.trim());
              setInputValue("");
            }}
          />
          <ShortcutBar />
        </Box>
      )}
    </Box>
  );
};
