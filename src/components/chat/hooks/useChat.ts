import { useState, useRef } from "react";
import React from "react";
import type { Provider } from "../../../types/config";
import { classifyIntent } from "../../../utils/intentClassifier";
import type { Message, ChatStage } from "../../../types/chat";
import {
  saveChat,
  listChats,
  getChatNameSuggestions,
} from "../../../utils/chatHistory";
import {
  appendMemory,
  buildMemorySummary,
  addMemory,
  deleteMemory,
  getSessionToolSummary,
  logToolCall,
} from "../../../utils/memory";
import { fetchFileTree, readImportantFiles } from "../../../utils/files";
import { readLensFile } from "../../../utils/lensfile";
import { registry } from "../../../utils/tools/registry";
import { buildDiffs } from "../../repo/DiffViewer";
import {
  walkDir,
  applyPatches,
  extractGithubUrl,
  toCloneUrl,
  buildSystemPrompt,
  parseResponse,
  callChat,
  type ChatResult,
} from "../../../utils/chat";

function hasUnclosedToolTag(text: string): boolean {
  for (const tag of registry.names()) {
    if (text.includes(`<${tag}>`) && !text.includes(`</${tag}>`)) return true;
  }
  const fences = text.match(/```/g);
  if (fences && fences.length % 2 !== 0) return true;
  return false;
}

export function useChat(repoPath: string, autoForce = false) {
  const [stage, setStage] = useState<ChatStage>({ type: "picking-provider" });
  const [committed, setCommitted] = useState<Message[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [pendingMsgIndex, setPendingMsgIndex] = useState<number | null>(null);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [clonedUrls, setClonedUrls] = useState<Set<string>>(new Set());
  const [showTimeline, setShowTimeline] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [autoApprove, setAutoApprove] = useState(autoForce);
  const [forceApprove, setForceApprove] = useState(autoForce);
  const [showForceWarning, setShowForceWarning] = useState(false);
  const [chatName, setChatName] = useState<string | null>(null);
  const [recentChats, setRecentChats] = useState<string[]>([]);

  const chatNameRef = useRef<string | null>(null);
  const providerRef = useRef<Provider | null>(null);
  const systemPromptRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const toolResultCache = useRef<Map<string, string>>(new Map());
  const batchApprovedRef = useRef(false);
  const forceApproveRef = useRef(autoForce);

  const updateChatName = (name: string) => {
    chatNameRef.current = name;
    setChatName(name);
  };

  React.useEffect(() => {
    providerRef.current = provider;
  }, [provider]);
  React.useEffect(() => {
    systemPromptRef.current = systemPrompt;
  }, [systemPrompt]);
  React.useEffect(() => {
    forceApproveRef.current = forceApprove;
  }, [forceApprove]);

  React.useEffect(() => {
    const chats = listChats(repoPath);
    setRecentChats(chats.slice(0, 10).map((c) => c.name));
  }, [repoPath]);

  React.useEffect(() => {
    if (chatNameRef.current && allMessages.length > 1) {
      saveChat(chatNameRef.current, repoPath, allMessages);
    }
  }, [allMessages]);

  const pushMsg = (msg: Message, currentAll: Message[]): Message[] => {
    const next = [...currentAll, msg];
    setAllMessages(next);
    setCommitted((prev) => [...prev, msg]);
    return next;
  };

  const handleError = (currentAll: Message[]) => (err: unknown) => {
    batchApprovedRef.current = false;
    if (err instanceof Error && err.name === "AbortError") {
      setStage({ type: "idle" });
      return;
    }
    const errMsg: Message = {
      role: "assistant",
      content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}`,
      type: "text",
    };
    pushMsg(errMsg, currentAll);
    setStage({ type: "idle" });
  };

  const callNext = async (
    messages: Message[],
    signal: AbortSignal,
    maxRetries = 3,
  ): Promise<ChatResult> => {
    const currentProvider = providerRef.current;
    const currentSystemPrompt = systemPromptRef.current;

    if (!currentProvider || signal.aborted)
      return { text: "", truncated: false };

    let currentMessages = messages;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal.aborted) return { text: "", truncated: false };

      const result = await callChat(
        currentProvider,
        currentSystemPrompt,
        currentMessages,
        signal,
      );

      if (result.text.trim()) return result;

      if (attempt < maxRetries) {
        const nudge: Message = {
          role: "assistant",
          content: `(model stalled — retrying ${attempt + 1}/${maxRetries})`,
          type: "text",
        };
        setCommitted((prev) => [...prev, nudge]);
        currentMessages = [
          ...currentMessages,
          {
            role: "user",
            content: "Please continue your response.",
            type: "text",
          },
        ];
      }
    }

    return { text: "", truncated: false };
  };

  const MAX_CONTINUATIONS = 3;

  const handleTruncation = async (
    raw: string,
    currentAll: Message[],
    signal: AbortSignal,
    depth: number,
  ): Promise<{ text: string; messages: Message[] } | null> => {
    if (depth >= MAX_CONTINUATIONS) return null;

    const truncNotice: Message = {
      role: "assistant",
      content: `(response cut off — continuing ${depth + 1}/${MAX_CONTINUATIONS}…)`,
      type: "text",
    };
    setCommitted((prev) => [...prev, truncNotice]);

    const partialMsg: Message = {
      role: "assistant",
      content: raw,
      type: "text",
    };
    const nudgeMsg: Message = {
      role: "user",
      content:
        "Your response was cut off. Please continue exactly from where you left off.",
      type: "text",
    };
    const withContext = [...currentAll, partialMsg, nudgeMsg];

    const result = await callNext(withContext, signal);
    return { text: result.text ?? "", messages: withContext };
  };

  const processMemoryTags = (raw: string): string => {
    const addMatches = [
      ...raw.matchAll(/<memory-add>([\s\S]*?)<\/memory-add>/g),
    ];
    const delMatches = [
      ...raw.matchAll(/<memory-delete>([\s\S]*?)<\/memory-delete>/g),
    ];
    for (const m of addMatches) {
      const content = m[1]!.trim();
      if (content) addMemory(content, repoPath);
    }
    for (const m of delMatches) {
      const id = m[1]!.trim();
      if (id) deleteMemory(id, repoPath);
    }
    return raw
      .replace(/<memory-add>[\s\S]*?<\/memory-add>/g, "")
      .replace(/<memory-delete>[\s\S]*?<\/memory-delete>/g, "")
      .trim();
  };

  const processResponse = async (
    raw: string,
    currentAll: Message[],
    signal: AbortSignal,
    truncated = false,
    continuationDepth = 0,
  ): Promise<void> => {
    if (signal.aborted) {
      batchApprovedRef.current = false;
      setStage({ type: "idle" });
      return;
    }

    if (truncated || hasUnclosedToolTag(raw)) {
      const cont = await handleTruncation(
        raw,
        currentAll,
        signal,
        continuationDepth,
      );
      if (!cont) {
        batchApprovedRef.current = false;
        const msg: Message = {
          role: "assistant",
          content:
            raw.trim() ||
            "(response was empty after multiple continuation attempts)",
          type: "text",
        };
        pushMsg(msg, currentAll);
        setStage({ type: "idle" });
        return;
      }
      return processResponse(
        cont.text,
        cont.messages,
        signal,
        false,
        continuationDepth + 1,
      );
    }

    const cleanRaw = processMemoryTags(raw);

    const parsed = parseResponse(cleanRaw);

    if (parsed.kind === "text") {
      batchApprovedRef.current = false;

      if (!parsed.content.trim()) {
        const stallMsg: Message = {
          role: "assistant",
          content:
            '(no response — try sending "continue" or start a new message)',
          type: "text",
        };
        pushMsg(stallMsg, currentAll);
        setStage({ type: "idle" });
        return;
      }

      const msg: Message = {
        role: "assistant",
        content: parsed.content,
        type: "text",
      };
      const withMsg = pushMsg(msg, currentAll);

      const lastUserMsg = [...currentAll]
        .reverse()
        .find((m) => m.role === "user");
      const githubUrl = lastUserMsg
        ? extractGithubUrl(lastUserMsg.content)
        : null;
      if (githubUrl && !clonedUrls.has(githubUrl)) {
        setTimeout(
          () => setStage({ type: "clone-offer", repoUrl: githubUrl }),
          80,
        );
      } else {
        setStage({ type: "idle" });
      }
      return;
    }

    if (parsed.kind === "changes") {
      batchApprovedRef.current = false;

      if (parsed.patches.length === 0) {
        const msg: Message = {
          role: "assistant",
          content: parsed.content,
          type: "text",
        };
        pushMsg(msg, currentAll);
        setStage({ type: "idle" });
        return;
      }

      const diffLines = buildDiffs(repoPath, parsed.patches);

      if (forceApproveRef.current) {
        const assistantMsg: Message = {
          role: "assistant",
          content: parsed.content,
          type: "plan",
          patches: parsed.patches,
          diffLines,
          applied: true,
        };
        const withAssistant = [...currentAll, assistantMsg];
        setAllMessages(withAssistant);
        setCommitted((prev) => [...prev, assistantMsg]);
        try {
          applyPatches(repoPath, parsed.patches);
          logToolCall(
            "changes",
            parsed.patches.map((p) => p.path).join(", "),
            `Applied changes to ${parsed.patches.length} file(s)`,
            repoPath,
          );
        } catch {}
        continueAfterChanges(withAssistant, parsed.content || "code changes");
        return;
      }

      const assistantMsg: Message = {
        role: "assistant",
        content: parsed.content,
        type: "plan",
        patches: parsed.patches,
        diffLines,
        applied: false,
      };
      const withAssistant = [...currentAll, assistantMsg];
      setAllMessages(withAssistant);
      setCommitted((prev) => [...prev, assistantMsg]);
      setPendingMsgIndex(withAssistant.length - 1);

      setStage({
        type: "preview",
        patches: parsed.patches,
        diffLines,
        scrollOffset: 0,
        pendingMessages: currentAll,
      });
      return;
    }

    if (parsed.kind === "clone") {
      batchApprovedRef.current = false;
      if (parsed.content) {
        const preambleMsg: Message = {
          role: "assistant",
          content: parsed.content,
          type: "text",
        };
        pushMsg(preambleMsg, currentAll);
      }
      setStage({
        type: "clone-offer",
        repoUrl: parsed.repoUrl,
        launchAnalysis: true,
      });
      return;
    }

    if (parsed.kind === "tool") {
      const tool = registry.get(parsed.toolName);
      if (!tool) {
        batchApprovedRef.current = false;
        setStage({ type: "idle" });
        return;
      }

      if (parsed.content) {
        const preambleMsg: Message = {
          role: "assistant",
          content: parsed.content,
          type: "text",
        };
        pushMsg(preambleMsg, currentAll);
      }

      const isSafe = tool.safe ?? false;
      const remainder = parsed.remainder;

      const executeAndContinue = async (approved: boolean): Promise<void> => {
        if (approved && remainder) batchApprovedRef.current = true;

        const currentProvider = providerRef.current;
        const currentSystemPrompt = systemPromptRef.current;

        if (!currentProvider) {
          batchApprovedRef.current = false;
          setStage({ type: "idle" });
          return;
        }

        let result = "(denied by user)";

        if (approved) {
          const cacheKey = isSafe
            ? `${parsed.toolName}:${parsed.rawInput}`
            : null;
          if (cacheKey && toolResultCache.current.has(cacheKey)) {
            result =
              toolResultCache.current.get(cacheKey)! +
              "\n\n[NOTE: This result was already retrieved earlier. Do not request it again.]";
          } else {
            try {
              setStage({ type: "thinking" });
              const toolResult = await tool.execute(parsed.input, {
                repoPath,
                messages: currentAll,
              });
              result = toolResult.value;
              if (cacheKey && toolResult.kind === "text") {
                toolResultCache.current.set(cacheKey, result);
              }
            } catch (err: unknown) {
              result = `Error: ${err instanceof Error ? err.message : "failed"}`;
            }
          }
        }

        if (approved && !result.startsWith("Error:")) {
          logToolCall(
            parsed.toolName,
            tool.summariseInput
              ? String(tool.summariseInput(parsed.input))
              : parsed.rawInput,
            result,
            repoPath,
          );
        }

        const displayContent = tool.summariseInput
          ? String(tool.summariseInput(parsed.input))
          : parsed.rawInput;

        const toolMsg: Message = {
          role: "assistant",
          type: "tool",
          toolName: parsed.toolName as any,
          content: displayContent,
          result,
          approved,
        };

        const withTool = pushMsg(toolMsg, currentAll);

        if (approved && remainder && remainder.length > 0) {
          return processResponse(
            remainder,
            withTool,
            signal,
            false,
            continuationDepth,
          );
        }

        batchApprovedRef.current = false;

        const nextAbort = new AbortController();
        abortControllerRef.current = nextAbort;
        setStage({ type: "thinking" });

        try {
          const nextResult = await callNext(withTool, nextAbort.signal);

          if (nextAbort.signal.aborted) return;

          if (!nextResult.text.trim()) {
            const stallMsg: Message = {
              role: "assistant",
              content: '(model stopped responding — try sending "continue")',
              type: "text",
            };
            pushMsg(stallMsg, withTool);
            setStage({ type: "idle" });
            return;
          }

          return processResponse(
            nextResult.text,
            withTool,
            nextAbort.signal,
            nextResult.truncated,
          );
        } catch (err) {
          handleError(withTool)(err);
        }
      };

      if (forceApprove || isSafe || batchApprovedRef.current) {
        return executeAndContinue(true);
      }

      const permLabel = tool.permissionLabel ?? tool.name;
      const permValue = tool.summariseInput
        ? String(tool.summariseInput(parsed.input))
        : parsed.rawInput;

      setStage({
        type: "permission",
        tool: {
          type: parsed.toolName as any,
          _display: permValue,
          _label: permLabel,
        } as any,
        pendingMessages: currentAll,
        resolve: executeAndContinue,
      });
    }
  };

  const continueAfterChanges = (currentAll: Message[], summary: string) => {
    if (!providerRef.current) {
      setStage({ type: "idle" });
      return;
    }

    const resultMsg: Message = {
      role: "assistant",
      type: "tool",
      toolName: "changes",
      content: summary,
      result: "Changes applied successfully.",
      approved: true,
    };

    const withResult = [...currentAll, resultMsg];
    setAllMessages(withResult);
    setCommitted((prev) => [...prev, resultMsg]);

    const abort = new AbortController();
    abortControllerRef.current = abort;
    setStage({ type: "thinking" });

    callNext(withResult, abort.signal)
      .then((result) => {
        if (abort.signal.aborted) return;
        if (!result.text.trim()) {
          setStage({ type: "idle" });
          return;
        }
        return processResponse(
          result.text,
          withResult,
          abort.signal,
          result.truncated,
        );
      })
      .catch(handleError(withResult));
  };

  const sendMessage = (
    text: string,
    currentProvider: Provider,
    currentSystemPrompt: string,
    currentAllMessages: Message[],
  ) => {
    const userMsg: Message = { role: "user", content: text, type: "text" };
    const nextAll = [...currentAllMessages, userMsg];
    setCommitted((prev) => [...prev, userMsg]);
    setAllMessages(nextAll);
    batchApprovedRef.current = false;

    if (!chatName) {
      const name =
        getChatNameSuggestions(nextAll)[0] ??
        `chat-${new Date().toISOString().slice(0, 10)}`;
      updateChatName(name);
      setRecentChats((prev) =>
        [name, ...prev.filter((n) => n !== name)].slice(0, 10),
      );
      saveChat(name, repoPath, nextAll);
    }

    const abort = new AbortController();
    abortControllerRef.current = abort;

    const intent = classifyIntent(text);
    const scopedToolsSection = registry.buildSystemPromptSection(intent);
    const sessionSummary = getSessionToolSummary(repoPath);

    let scopedSystemPrompt = currentSystemPrompt.replace(
      /## TOOLS[\s\S]*?(?=\n## (?!TOOLS))/,
      scopedToolsSection + "\n\n",
    );
    if (sessionSummary) {
      scopedSystemPrompt = scopedSystemPrompt.replace(
        /## CODEBASE/,
        sessionSummary + "\n\n## CODEBASE",
      );
    }

    setStage({ type: "thinking" });

    callChat(currentProvider, scopedSystemPrompt, nextAll, abort.signal)
      .then((result: ChatResult) =>
        processResponse(result.text, nextAll, abort.signal, result.truncated),
      )
      .catch(handleError(nextAll));
  };

  const handleProviderDone = (p: Provider) => {
    setProvider(p);
    providerRef.current = p;
    setStage({ type: "loading" });

    fetchFileTree(repoPath)
      .catch(() => walkDir(repoPath))
      .then((fileTree) => {
        const importantFiles = readImportantFiles(repoPath, fileTree);
        const historySummary = buildMemorySummary(repoPath);
        const lensFile = readLensFile(repoPath);
        const lensContext = lensFile
          ? `\n\n## LENS.md (previous analysis)\n${lensFile.overview}\n\nImportant folders: ${lensFile.importantFolders.join(", ")}\nSuggestions: ${lensFile.suggestions.slice(0, 3).join("; ")}`
          : "";
        const toolsSection = registry.buildSystemPromptSection();
        const prompt =
          buildSystemPrompt(importantFiles, historySummary, toolsSection) +
          lensContext;

        setSystemPrompt(prompt);
        systemPromptRef.current = prompt;

        const greeting: Message = {
          role: "assistant",
          content: `Welcome to Lens\nCodebase loaded — ${importantFiles.length} files indexed.${historySummary ? "\n\nI have memory of previous actions in this repo." : ""}${lensFile ? "\n\nFound LENS.md — I have context from a previous analysis of this repo." : ""}\nAsk me anything, tell me what to build, share a URL, or ask me to read/write files.\n\nTip: type /timeline to browse commit history.\nTip: ⭐ Star Lens on GitHub — github.com/ridit-jangra/Lens`,
          type: "text",
        };

        setCommitted([greeting]);
        setAllMessages([greeting]);
        setStage({ type: "idle" });
      })
      .catch(() => setStage({ type: "idle" }));
  };

  const abortThinking = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    batchApprovedRef.current = false;
    setStage({ type: "idle" });
  };

  const applyPatchesAndContinue = (patches: any[]) => {
    try {
      applyPatches(repoPath, patches);
      logToolCall(
        "changes",
        patches.map((p) => p.path).join(", "),
        `Applied changes to ${patches.length} file(s)`,
        repoPath,
      );
    } catch {
      /* non-fatal */
    }
  };

  const skipPatches = (patches: any[]) => {
    logToolCall(
      "changes-skipped",
      patches.map((p: { path: string }) => p.path).join(", "),
      `Skipped changes to ${patches.length} file(s)`,
      repoPath,
    );
  };

  return {
    stage,
    setStage,
    committed,
    setCommitted,
    provider,
    setProvider,
    systemPrompt,
    allMessages,
    setAllMessages,
    clonedUrls,
    setClonedUrls,
    showTimeline,
    setShowTimeline,
    showReview,
    setShowReview,
    autoApprove,
    setAutoApprove,
    forceApprove,
    setForceApprove,
    showForceWarning,
    setShowForceWarning,
    chatName,
    setChatName,
    recentChats,
    setRecentChats,
    pendingMsgIndex,
    setPendingMsgIndex,

    chatNameRef,
    providerRef,
    batchApprovedRef,

    updateChatName,
    sendMessage,
    handleProviderDone,
    abortThinking,
    applyPatchesAndContinue,
    continueAfterChanges,
    skipPatches,
    processResponse,
    handleError,
  };
}
