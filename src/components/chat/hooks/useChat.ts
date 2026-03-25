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

export function useChat(repoPath: string) {
  const [stage, setStage] = useState<ChatStage>({ type: "picking-provider" });
  const [committed, setCommitted] = useState<Message[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [pendingMsgIndex, setPendingMsgIndex] = useState<number | null>(null);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [clonedUrls, setClonedUrls] = useState<Set<string>>(new Set());
  const [showTimeline, setShowTimeline] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  const [forceApprove, setForceApprove] = useState(false);
  const [showForceWarning, setShowForceWarning] = useState(false);
  const [chatName, setChatName] = useState<string | null>(null);
  const [recentChats, setRecentChats] = useState<string[]>([]);

  const chatNameRef = useRef<string | null>(null);
  const providerRef = useRef<Provider | null>(null);
  const systemPromptRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const toolResultCache = useRef<Map<string, string>>(new Map());
  const batchApprovedRef = useRef(false);

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
    const chats = listChats(repoPath);
    setRecentChats(chats.slice(0, 10).map((c) => c.name));
  }, [repoPath]);

  React.useEffect(() => {
    if (chatNameRef.current && allMessages.length > 1) {
      saveChat(chatNameRef.current, repoPath, allMessages);
    }
  }, [allMessages]);

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
    setAllMessages([...currentAll, errMsg]);
    setCommitted((prev) => [...prev, errMsg]);
    setStage({ type: "idle" });
  };

  const MAX_AUTO_CONTINUES = 3;

  function isLikelyTruncated(text: string): boolean {
    // Check unclosed XML tool tags (dynamic — includes addon tools)
    for (const tag of registry.names()) {
      if (text.includes(`<${tag}>`) && !text.includes(`</${tag}>`))
        return true;
    }
    // Check unclosed fenced code blocks (```tool\n... without closing ```)
    const fences = text.match(/```/g);
    if (fences && fences.length % 2 !== 0) return true;
    return false;
  }

  const processResponse = (
    raw: string,
    currentAll: Message[],
    signal: AbortSignal,
    truncated = false,
    continueCount = 0,
  ) => {
    if (signal.aborted) {
      batchApprovedRef.current = false;
      setStage({ type: "idle" });
      return;
    }

    if (truncated || isLikelyTruncated(raw)) {
      if (continueCount >= MAX_AUTO_CONTINUES) {
        // Give up after max attempts — show whatever we have
        batchApprovedRef.current = false;
        const msg: Message = {
          role: "assistant",
          content:
            raw.trim() ||
            "(response was empty after multiple continuation attempts)",
          type: "text",
        };
        setAllMessages([...currentAll, msg]);
        setCommitted((prev) => [...prev, msg]);
        setStage({ type: "idle" });
        return;
      }

      // Include the partial response so the model knows where it left off
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

      const truncMsg: Message = {
        role: "assistant",
        content: `(response cut off — auto-continuing ${continueCount + 1}/${MAX_AUTO_CONTINUES}…)`,
        type: "text",
      };
      setAllMessages([...currentAll, truncMsg]);
      setCommitted((prev) => [...prev, truncMsg]);

      const currentProvider = providerRef.current;
      const currentSystemPrompt = systemPromptRef.current;

      if (!currentProvider) {
        setStage({ type: "idle" });
        return;
      }

      const nextAbort = new AbortController();
      abortControllerRef.current = nextAbort;
      setStage({ type: "thinking" });
      callChat(
        currentProvider,
        currentSystemPrompt,
        withContext,
        nextAbort.signal,
      )
        .then((result: ChatResult) => {
          if (nextAbort.signal.aborted) return;
          processResponse(
            result.text ?? "",
            withContext,
            nextAbort.signal,
            result.truncated,
            continueCount + 1,
          );
        })
        .catch(handleError(withContext));
      return;
    }

    const memAddMatches = [
      ...raw.matchAll(/<memory-add>([\s\S]*?)<\/memory-add>/g),
    ];
    const memDelMatches = [
      ...raw.matchAll(/<memory-delete>([\s\S]*?)<\/memory-delete>/g),
    ];
    for (const match of memAddMatches) {
      const content = match[1]!.trim();
      if (content) addMemory(content, repoPath);
    }
    for (const match of memDelMatches) {
      const id = match[1]!.trim();
      if (id) deleteMemory(id, repoPath);
    }
    const cleanRaw = raw
      .replace(/<memory-add>[\s\S]*?<\/memory-add>/g, "")
      .replace(/<memory-delete>[\s\S]*?<\/memory-delete>/g, "")
      .trim();

    const parsed = parseResponse(cleanRaw);

    if (parsed.kind === "changes") {
      batchApprovedRef.current = false;
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

    if (parsed.kind === "clone") {
      batchApprovedRef.current = false;
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

    if (parsed.kind === "text") {
      batchApprovedRef.current = false;

      if (!parsed.content.trim()) {
        const stallMsg: Message = {
          role: "assistant",
          content:
            '(no response — the model may have stalled. Try sending a short follow-up like "continue" or start a new message.)',
          type: "text",
        };
        setAllMessages([...currentAll, stallMsg]);
        setCommitted((prev) => [...prev, stallMsg]);
        setStage({ type: "idle" });
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
        setTimeout(
          () => setStage({ type: "clone-offer", repoUrl: githubUrl }),
          80,
        );
      } else {
        setStage({ type: "idle" });
      }
      return;
    }

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
      setAllMessages([...currentAll, preambleMsg]);
      setCommitted((prev) => [...prev, preambleMsg]);
    }

    const remainder = parsed.remainder;
    const isSafe = tool.safe ?? false;

    const executeAndContinue = async (approved: boolean) => {
      if (approved && remainder) {
        batchApprovedRef.current = true;
      }

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

      const withTool = [...currentAll, toolMsg];
      setAllMessages(withTool);
      setCommitted((prev) => [...prev, toolMsg]);

      if (approved && remainder && remainder.length > 0) {
        processResponse(remainder, withTool, signal, truncated, continueCount);
        return;
      }

      batchApprovedRef.current = false;

      const nextAbort = new AbortController();
      abortControllerRef.current = nextAbort;
      setStage({ type: "thinking" });

      const callWithAutoContinue = async (
        messages: Message[],
        maxRetries = 3,
      ): Promise<ChatResult> => {
        let currentMessages = messages;
        for (let i = 0; i < maxRetries; i++) {
          if (nextAbort.signal.aborted)
            return { text: "", truncated: false };
          const result = await callChat(
            currentProvider,
            currentSystemPrompt,
            currentMessages,
            nextAbort.signal,
          );
          if (result.text.trim()) return result;
          const nudgeMsg: Message = {
            role: "assistant",
            content: `(model stalled — auto-continuing, attempt ${i + 1}/${maxRetries})`,
            type: "text",
          };
          setCommitted((prev) => [...prev, nudgeMsg]);
          setAllMessages((prev) => [...prev, nudgeMsg]);
          currentMessages = [
            ...currentMessages,
            {
              role: "user",
              content:
                "Please continue. Provide your response to the previous tool output.",
              type: "text",
            },
          ];
        }
        return { text: "", truncated: false };
      };

      callWithAutoContinue(withTool)
        .then((result: ChatResult) => {
          if (nextAbort.signal.aborted) return;
          processResponse(
            result.text ?? "",
            withTool,
            nextAbort.signal,
            result.truncated,
          );
        })
        .catch(handleError(withTool));
    };

    if (forceApprove || isSafe || batchApprovedRef.current) {
      executeAndContinue(true);
      return;
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
    skipPatches,
    processResponse,
    handleError,
  };
}
