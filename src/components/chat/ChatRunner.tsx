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
  buildSystemPrompt,
  parseResponse,
  callChat,
} from "../../utils/chat";
import { StaticMessage } from "./ChatMessage";
import {
  PermissionPrompt,
  InputBox,
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

  // ── Input buffering ─────────────────────────────────────────────────────────

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

  // ── Response handling ───────────────────────────────────────────────────────

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
      });
      return;
    }

    if (parsed.kind === "shell" || parsed.kind === "fetch") {
      const tool =
        parsed.kind === "shell"
          ? { type: "shell" as const, command: parsed.command }
          : { type: "fetch" as const, url: parsed.url };

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
              result =
                parsed.kind === "shell"
                  ? await runShell(parsed.command, repoPath)
                  : await fetchUrl(parsed.url);
            } catch (err: unknown) {
              result = `Error: ${err instanceof Error ? err.message : "failed"}`;
            }
          }

          const toolMsg: Message = {
            role: "assistant",
            type: "tool",
            toolName: parsed.kind,
            content: parsed.kind === "shell" ? parsed.command : parsed.url,
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

    // Plain text
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
    const userMsg: Message = { role: "user", content: text, type: "text" };
    const nextAll = [...allMessages, userMsg];
    setCommitted((prev) => [...prev, userMsg]);
    setAllMessages(nextAll);
    setStage({ type: "thinking" });
    callChat(provider, systemPrompt, nextAll)
      .then((raw: string) => processResponse(raw, nextAll))
      .catch(handleError(nextAll));
  };

  // ── Input handler ───────────────────────────────────────────────────────────

  useInput((input, key) => {
    // ── idle ───────────────────────────────────────────────────────
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

    // ── clone-offer ────────────────────────────────────────────────
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

    // ── clone-exists ───────────────────────────────────────────────
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

    // ── clone-done / clone-error ───────────────────────────────────
    if (stage.type === "clone-done" || stage.type === "clone-error") {
      if (key.return || key.escape) setStage({ type: "idle" });
      return;
    }

    // ── cloning — no input ─────────────────────────────────────────
    if (stage.type === "cloning") return;

    // ── permission ─────────────────────────────────────────────────
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

    // ── preview ────────────────────────────────────────────────────
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
          if (msg?.type === "plan")
            setCommitted((prev) => [...prev, { ...msg, applied: false }]);
        }
        setPendingMsgIndex(null);
        setStage({ type: "idle" });
        return;
      }
      if (key.return || input === "a" || input === "A") {
        try {
          applyPatches(repoPath, stage.patches);
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

    // ── viewing-file ───────────────────────────────────────────────
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

  // ── Provider setup ──────────────────────────────────────────────────────────

  const handleProviderDone = (p: Provider) => {
    setProvider(p);
    setStage({ type: "loading" });
    fetchFileTree(repoPath)
      .catch(() => walkDir(repoPath))
      .then((fileTree) => {
        const importantFiles = readImportantFiles(repoPath, fileTree);
        setSystemPrompt(buildSystemPrompt(importantFiles));
        const greeting: Message = {
          role: "assistant",
          content: `Codebase loaded — ${importantFiles.length} files indexed. Ask me anything, tell me what to build, or share a URL to review.`,
          type: "text",
        };
        setCommitted([greeting]);
        setAllMessages([greeting]);
        setStage({ type: "idle" });
      })
      .catch(() => setStage({ type: "idle" }));
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (stage.type === "picking-provider")
    return <ProviderPicker onDone={handleProviderDone} />;
  if (stage.type === "loading") {
    return (
      <Box marginTop={1} gap={1}>
        <Text color={ORANGE}>
          <Spinner />
        </Text>
        <Text>Indexing codebase...</Text>
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

  // idle / thinking / permission
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
          <Text color="gray">{thinkingPhrase}</Text>
        </Box>
      )}

      {stage.type === "permission" && (
        <PermissionPrompt tool={stage.tool} onDecide={stage.resolve} />
      )}

      {stage.type === "idle" && (
        <>
          <InputBox value={inputValue} />
          <Text color="gray" dimColor>
            enter to send · ctrl+v to paste · ctrl+c to exit
          </Text>
        </>
      )}
    </Box>
  );
};
