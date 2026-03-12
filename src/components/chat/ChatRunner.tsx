import React from "react";
import { Box, Text, Static, useInput } from "ink";
import Spinner from "ink-spinner";
import { useState, useRef } from "react";
import path from "path";
import os from "os";
import { ORANGE } from "../../colors";
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
  runShell,
  fetchUrl,
  readFile,
  writeFile,
  buildSystemPrompt,
  parseResponse,
  callChat,
} from "../../utils/chat";
import { StaticMessage } from "./ChatMessage";
import {
  PermissionPrompt,
  InputBox,
  ShortcutBar,
  CloneOfferView,
  CloningView,
  CloneExistsView,
  CloneDoneView,
  CloneErrorView,
  PreviewView,
  ViewingFileView,
} from "./ChatOverlays";
import type { Provider } from "../../types/config";
import type { Message, ChatStage } from "../../types/chat";
import {
  appendHistory,
  buildHistorySummary,
  clearRepoHistory,
} from "../../utils/history";

export const ChatRunner = ({ repoPath }: { repoPath: string }) => {
  const [stage, setStage] = useState<ChatStage>({ type: "picking-provider" });
  const [committed, setCommitted] = useState<Message[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [pendingMsgIndex, setPendingMsgIndex] = useState<number | null>(null);
  const [allMessages, setAllMessages] = useState<Message[]>([]);

  const inputBuffer = useRef("");
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingPhrase = useThinkingPhrase(stage.type === "thinking");

  //

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

  //

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

    //
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
      });
      return;
    }

    //
    if (
      parsed.kind === "shell" ||
      parsed.kind === "fetch" ||
      parsed.kind === "read-file" ||
      parsed.kind === "write-file"
    ) {
      let tool: Parameters<typeof PermissionPrompt>[0]["tool"];
      if (parsed.kind === "shell") {
        tool = { type: "shell", command: parsed.command };
      } else if (parsed.kind === "fetch") {
        tool = { type: "fetch", url: parsed.url };
      } else if (parsed.kind === "read-file") {
        tool = { type: "read-file", filePath: parsed.filePath };
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
            } as const;
            appendHistory({
              kind: kindMap[parsed.kind as keyof typeof kindMap] ?? "shell-run",
              detail:
                parsed.kind === "shell"
                  ? parsed.command
                  : parsed.kind === "fetch"
                    ? parsed.url
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
                  : "write-file";

          const toolContent =
            parsed.kind === "shell"
              ? parsed.command
              : parsed.kind === "fetch"
                ? parsed.url
                : parsed.kind === "read-file"
                  ? parsed.filePath
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

    //
    const msg: Message = {
      role: "assistant",
      content: parsed.content,
      type: "text",
    };
    const withMsg = [...currentAll, msg];
    setAllMessages(withMsg);
    setCommitted((prev) => [...prev, msg]);

    const recentUserText = currentAll
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content)
      .join(" ");
    const githubUrl = extractGithubUrl(recentUserText);

    if (githubUrl) {
      setTimeout(() => {
        setStage({
          type: "clone-offer",
          repoUrl: githubUrl,
          cloneUrl: toCloneUrl(githubUrl),
        });
      }, 80);
    } else {
      setStage({ type: "idle" });
    }
  };

  const sendMessage = (text: string) => {
    if (!provider) return;

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

  //

  useInput((input, key) => {
    //
    if (stage.type === "idle") {
      if (key.ctrl && input === "c") {
        process.exit(0);
        return;
      }

      if (key.ctrl && (input === "v" || input === "V")) {
        flushBuffer();
        const clip = readClipboard();
        if (clip) setInputValue((v) => v + clip);
        return;
      }

      if (key.return) {
        flushBuffer();
        const pending = inputBuffer.current;
        inputBuffer.current = "";
        if (flushTimer.current) {
          clearTimeout(flushTimer.current);
          flushTimer.current = null;
        }
        setInputValue((v) => {
          const full = (v + pending).trim();
          if (full) setTimeout(() => sendMessage(full), 0);
          return "";
        });
        return;
      }

      if (key.backspace || key.delete) {
        flushBuffer();
        if (flushTimer.current) {
          clearTimeout(flushTimer.current);
          flushTimer.current = null;
        }
        setTimeout(() => setInputValue((v) => v.slice(0, -1)), 0);
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        inputBuffer.current += input;
        scheduleFlush();
      }
      return;
    }

    //
    if (stage.type === "clone-offer") {
      if (input === "y" || input === "Y" || key.return) {
        const { repoUrl, cloneUrl } = stage;
        setStage({ type: "cloning", repoUrl, cloneUrl });
        startCloneRepo(cloneUrl).then((result) => {
          if (result.done) {
            const repoName =
              cloneUrl
                .split("/")
                .pop()
                ?.replace(/\.git$/, "") ?? "repo";
            const destPath = path.join(os.tmpdir(), repoName);
            const fileCount = walkDir(destPath).length;
            setStage({ type: "clone-done", repoUrl, destPath, fileCount });
          } else if (result.folderExists && result.repoPath) {
            setStage({
              type: "clone-exists",
              repoUrl,
              cloneUrl,
              repoPath: result.repoPath,
            });
          } else {
            setStage({
              type: "clone-error",
              repoUrl,
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

    //
    if (stage.type === "clone-exists") {
      if (input === "y" || input === "Y") {
        const { repoUrl, cloneUrl, repoPath: existingPath } = stage;
        setStage({ type: "cloning", repoUrl, cloneUrl });
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
              repoUrl,
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

    //
    if (stage.type === "clone-done" || stage.type === "clone-error") {
      if (key.return || key.escape) setStage({ type: "idle" });
      return;
    }

    //
    if (stage.type === "cloning") return;

    //
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

    //
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

    //
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

  //

  const handleProviderDone = (p: Provider) => {
    setProvider(p);
    setStage({ type: "loading" });
    fetchFileTree(repoPath)
      .catch(() => walkDir(repoPath))
      .then((fileTree) => {
        const importantFiles = readImportantFiles(repoPath, fileTree);
        const historySummary = buildHistorySummary(repoPath);
        setSystemPrompt(buildSystemPrompt(importantFiles, historySummary));
        const historyNote = historySummary
          ? "\n\nI have memory of previous actions in this repo."
          : "";
        const greeting: Message = {
          role: "assistant",
          content: `Codebase loaded — ${importantFiles.length} files indexed.${historyNote}\n\nAsk me anything, tell me what to build, share a URL, or ask me to read/write files.`,
          type: "text",
        };
        setCommitted([greeting]);
        setAllMessages([greeting]);
        setStage({ type: "idle" });
      })
      .catch(() => setStage({ type: "idle" }));
  };

  //

  if (stage.type === "picking-provider")
    return <ProviderPicker onDone={handleProviderDone} />;

  if (stage.type === "loading") {
    return (
      <Box marginTop={1} gap={1}>
        <Text color={ORANGE}>
          <Spinner />
        </Text>
        <Text>Indexing codebase…</Text>
      </Box>
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
    <Box flexDirection="column" gap={1}>
      <Static items={committed}>
        {(msg, i) => <StaticMessage key={i} msg={msg} />}
      </Static>

      {stage.type === "thinking" && (
        <Box gap={1}>
          <Text color={ORANGE}>
            <Spinner />
          </Text>
          <Text color="gray" dimColor>
            {thinkingPhrase}
          </Text>
        </Box>
      )}

      {stage.type === "permission" && (
        <PermissionPrompt tool={stage.tool} onDecide={stage.resolve} />
      )}

      {stage.type === "idle" && (
        <>
          <InputBox value={inputValue} />
          <ShortcutBar />
        </>
      )}
    </Box>
  );
};
