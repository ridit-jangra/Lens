import { useState, useRef } from "react";
import React from "react";
import type { Provider } from "../../../types/config";
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

  const TOOL_TAG_NAMES = [
    "shell",
    "fetch",
    "read-file",
    "read-folder",
    "grep",
    "write-file",
    "delete-file",
    "delete-folder",
    "open-url",
    "generate-pdf",
    "search",
    "clone",
    "changes",
  ];

  function isLikelyTruncated(text: string): boolean {
    return TOOL_TAG_NAMES.some(
      (tag) => text.includes(`<${tag}>`) && !text.includes(`</${tag}>`),
    );
  }

  const processResponse = (
    raw: string,
    currentAll: Message[],
    signal: AbortSignal,
  ) => {
    if (signal.aborted) {
      batchApprovedRef.current = false;
      setStage({ type: "idle" });
      return;
    }

    if (isLikelyTruncated(raw)) {
      const truncMsg: Message = {
        role: "assistant",
        content:
          "(response cut off — the model hit its output limit mid-tool-call. Try asking it to continue, or simplify the request.)",
        type: "text",
      };
      setAllMessages([...currentAll, truncMsg]);
      setCommitted((prev) => [...prev, truncMsg]);
      setStage({ type: "idle" });
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
        appendMemory({
          kind: "shell-run",
          detail: tool.summariseInput
            ? String(tool.summariseInput(parsed.input))
            : parsed.rawInput,
          summary: result.split("\n")[0]?.slice(0, 120) ?? "",
        });
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
        processResponse(remainder, withTool, signal);
        return;
      }

      batchApprovedRef.current = false;

      const nextAbort = new AbortController();
      abortControllerRef.current = nextAbort;
      setStage({ type: "thinking" });

      callChat(currentProvider, currentSystemPrompt, withTool, nextAbort.signal)
        .then((r: string) => {
          if (nextAbort.signal.aborted) return;
          if (!r.trim()) {
            const nudged: Message[] = [
              ...withTool,
              { role: "user", content: "Please continue.", type: "text" },
            ];
            return callChat(
              currentProvider,
              currentSystemPrompt,
              nudged,
              nextAbort.signal,
            );
          }
          return r;
        })
        .then((r: string | undefined) => {
          if (nextAbort.signal.aborted) return;
          processResponse(r ?? "", withTool, nextAbort.signal);
        })
        .catch(handleError(withTool));
    };

    if (forceApprove || (autoApprove && isSafe) || batchApprovedRef.current) {
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

    setStage({ type: "thinking" });
    callChat(currentProvider, currentSystemPrompt, nextAll, abort.signal)
      .then((raw: string) => processResponse(raw, nextAll, abort.signal))
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
      appendMemory({
        kind: "code-applied",
        detail: patches.map((p) => p.path).join(", "),
        summary: `Applied changes to ${patches.length} file(s)`,
      });
    } catch {
      /* non-fatal */
    }
  };

  const skipPatches = (patches: any[]) => {
    appendMemory({
      kind: "code-skipped",
      detail: patches.map((p: { path: string }) => p.path).join(", "),
      summary: `Skipped changes to ${patches.length} file(s)`,
    });
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
