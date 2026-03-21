import React from "react";
import { Box, Text, Static, useInput } from "ink";
import Spinner from "ink-spinner";
import { useState, useRef } from "react";
import path from "path";
import os from "os";
import TextInput from "ink-text-input";
import { ACCENT } from "../../colors";
import { buildDiffs } from "../repo/DiffViewer";
import { ProviderPicker } from "../provider/ProviderPicker";
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
  buildSystemPrompt,
  parseResponse,
  callChat,
} from "../../utils/chat";
import {
  saveChat,
  loadChat,
  listChats,
  deleteChat,
  getChatNameSuggestions,
} from "../../utils/chatHistory";
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
  appendMemory,
  buildMemorySummary,
  clearRepoMemory,
  addMemory,
  deleteMemory,
  listMemories,
} from "../../utils/memory";
import { readLensFile } from "../../utils/lensfile";
import { ReviewCommand } from "../../commands/review";
import { registry } from "../../utils/tools/registry";

const COMMANDS = [
  { cmd: "/timeline", desc: "browse commit history" },
  { cmd: "/clear history", desc: "wipe session memory for this repo" },
  { cmd: "/review", desc: "review current codebase" },
  { cmd: "/auto", desc: "toggle auto-approve for read/search tools" },
  {
    cmd: "/auto --force-all",
    desc: "auto-approve ALL tools including shell and writes (⚠ dangerous)",
  },
  { cmd: "/chat", desc: "chat history commands" },
  { cmd: "/chat list", desc: "list saved chats for this repo" },
  { cmd: "/chat load", desc: "load a saved chat by name" },
  { cmd: "/chat rename", desc: "rename the current chat" },
  { cmd: "/chat delete", desc: "delete a saved chat by name" },
  { cmd: "/memory", desc: "memory commands" },
  { cmd: "/memory list", desc: "list all memories for this repo" },
  { cmd: "/memory add", desc: "add a memory" },
  { cmd: "/memory delete", desc: "delete a memory by id" },
  { cmd: "/memory clear", desc: "clear all memories for this repo" },
];

function CommandPalette({
  query,
  onSelect,
  recentChats,
}: {
  query: string;
  onSelect: (cmd: string) => void;
  recentChats: string[];
}) {
  const q = query.toLowerCase();
  const isChatLoad = q.startsWith("/chat load") || q.startsWith("/chat delete");
  const chatFilter = isChatLoad
    ? q.startsWith("/chat load")
      ? q.slice("/chat load".length).trim()
      : q.slice("/chat delete".length).trim()
    : "";
  const filteredChats = chatFilter
    ? recentChats.filter((n) => n.toLowerCase().includes(chatFilter))
    : recentChats;
  const matches = COMMANDS.filter((c) => c.cmd.startsWith(q));
  if (!matches.length && !isChatLoad) return null;
  if (!matches.length && isChatLoad && filteredChats.length === 0) return null;
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
      {isChatLoad && filteredChats.length > 0 && (
        <Box flexDirection="column" marginTop={matches.length ? 1 : 0}>
          <Text color="gray" dimColor>
            {chatFilter ? `matching "${chatFilter}":` : "recent chats:"}
          </Text>
          {filteredChats.map((name, i) => (
            <Box key={i} gap={1} marginLeft={2}>
              <Text color={ACCENT}>·</Text>
              <Text color="white">{name}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function ForceAllWarning({
  onConfirm,
}: {
  onConfirm: (confirmed: boolean) => void;
}) {
  const [input, setInput] = useState("");

  return (
    <Box flexDirection="column" marginY={1} gap={1}>
      <Box gap={1}>
        <Text color="red" bold>
          ⚠ WARNING
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2} gap={1}>
        <Text color="yellow">
          Force-all mode auto-approves EVERY tool without asking — including:
        </Text>
        <Text color="red" dimColor>
          {" "}
          · shell commands (rm, git, npm, anything)
        </Text>
        <Text color="red" dimColor>
          {" "}
          · file writes and deletes
        </Text>
        <Text color="red" dimColor>
          {" "}
          · folder deletes
        </Text>
        <Text color="red" dimColor>
          {" "}
          · external fetches and URL opens
        </Text>
        <Text color="yellow" dimColor>
          The AI can modify or delete files without any confirmation.
        </Text>
        <Text color="yellow" dimColor>
          Only use this in throwaway environments or when you fully trust the
          task.
        </Text>
      </Box>
      <Box gap={1} marginTop={1}>
        <Text color="gray">Type </Text>
        <Text color="white" bold>
          yes
        </Text>
        <Text color="gray"> to enable, or press </Text>
        <Text color="white" bold>
          esc
        </Text>
        <Text color="gray"> to cancel: </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={(v) => onConfirm(v.trim().toLowerCase() === "yes")}
          placeholder="yes / esc to cancel"
        />
      </Box>
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
  const [autoApprove, setAutoApprove] = useState(false);
  const [forceApprove, setForceApprove] = useState(false);
  const [showForceWarning, setShowForceWarning] = useState(false);
  const [chatName, setChatName] = useState<string | null>(null);
  const chatNameRef = useRef<string | null>(null);
  const [recentChats, setRecentChats] = useState<string[]>([]);
  const inputHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [inputKey, setInputKey] = useState(0);

  const updateChatName = (name: string) => {
    chatNameRef.current = name;
    setChatName(name);
  };

  const abortControllerRef = useRef<AbortController | null>(null);
  const toolResultCache = useRef<Map<string, string>>(new Map());
  const batchApprovedRef = useRef(false);

  const thinkingPhrase = useThinkingPhrase(stage.type === "thinking");

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

    // Guard: response cut off mid-tool-tag (context limit hit during generation)
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
      callChat(provider!, systemPrompt, withTool, nextAbort.signal)
        .then((r: string) => processResponse(r, withTool, nextAbort.signal))
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

    // /auto --force-all — show warning first
    if (text.trim().toLowerCase() === "/auto --force-all") {
      if (forceApprove) {
        // Toggle off immediately, no warning needed
        setForceApprove(false);
        setAutoApprove(false);
        const msg: Message = {
          role: "assistant",
          content: "Force-all mode OFF — tools will ask for permission again.",
          type: "text",
        };
        setCommitted((prev) => [...prev, msg]);
        setAllMessages((prev) => [...prev, msg]);
      } else {
        setShowForceWarning(true);
      }
      return;
    }

    if (text.trim().toLowerCase() === "/auto") {
      // /auto never enables force-all, only toggles safe auto-approve
      if (forceApprove) {
        // Step down from force-all to normal auto
        setForceApprove(false);
        setAutoApprove(true);
        const msg: Message = {
          role: "assistant",
          content:
            "Force-all mode OFF — switched to normal auto-approve (safe tools only).",
          type: "text",
        };
        setCommitted((prev) => [...prev, msg]);
        setAllMessages((prev) => [...prev, msg]);
        return;
      }
      const next = !autoApprove;
      setAutoApprove(next);
      const msg: Message = {
        role: "assistant",
        content: next
          ? "Auto-approve ON — safe tools (read, search, fetch) will run without asking."
          : "Auto-approve OFF — all tools will ask for permission.",
        type: "text",
      };
      setCommitted((prev) => [...prev, msg]);
      setAllMessages((prev) => [...prev, msg]);
      return;
    }

    if (text.trim().toLowerCase() === "/clear history") {
      clearRepoMemory(repoPath);
      const msg: Message = {
        role: "assistant",
        content: "History cleared for this repo.",
        type: "text",
      };
      setCommitted((prev) => [...prev, msg]);
      setAllMessages((prev) => [...prev, msg]);
      return;
    }

    if (text.trim().toLowerCase() === "/chat") {
      const msg: Message = {
        role: "assistant",
        content:
          "Chat commands: `/chat list` · `/chat load <n>` · `/chat rename <n>` · `/chat delete <n>`",
        type: "text",
      };
      setCommitted((prev) => [...prev, msg]);
      setAllMessages((prev) => [...prev, msg]);
      return;
    }

    if (text.trim().toLowerCase().startsWith("/chat rename")) {
      const parts = text.trim().split(/\s+/);
      const newName = parts.slice(2).join("-");
      if (!newName) {
        const msg: Message = {
          role: "assistant",
          content: "Usage: `/chat rename <new-name>`",
          type: "text",
        };
        setCommitted((prev) => [...prev, msg]);
        setAllMessages((prev) => [...prev, msg]);
        return;
      }
      const oldName = chatNameRef.current;
      if (oldName) deleteChat(oldName);
      updateChatName(newName);
      saveChat(newName, repoPath, allMessages);
      setRecentChats((prev) =>
        [newName, ...prev.filter((n) => n !== newName && n !== oldName)].slice(
          0,
          10,
        ),
      );
      const msg: Message = {
        role: "assistant",
        content: `Chat renamed to **${newName}**.`,
        type: "text",
      };
      setCommitted((prev) => [...prev, msg]);
      setAllMessages((prev) => [...prev, msg]);
      return;
    }

    if (text.trim().toLowerCase().startsWith("/chat delete")) {
      const parts = text.trim().split(/\s+/);
      const name = parts.slice(2).join("-");
      if (!name) {
        const msg: Message = {
          role: "assistant",
          content: "Usage: `/chat delete <n>`",
          type: "text",
        };
        setCommitted((prev) => [...prev, msg]);
        setAllMessages((prev) => [...prev, msg]);
        return;
      }
      const deleted = deleteChat(name);
      if (!deleted) {
        const msg: Message = {
          role: "assistant",
          content: `Chat **${name}** not found.`,
          type: "text",
        };
        setCommitted((prev) => [...prev, msg]);
        setAllMessages((prev) => [...prev, msg]);
        return;
      }
      if (chatNameRef.current === name) {
        chatNameRef.current = null;
        setChatName(null);
      }
      setRecentChats((prev) => prev.filter((n) => n !== name));
      const msg: Message = {
        role: "assistant",
        content: `Chat **${name}** deleted.`,
        type: "text",
      };
      setCommitted((prev) => [...prev, msg]);
      setAllMessages((prev) => [...prev, msg]);
      return;
    }

    if (text.trim().toLowerCase() === "/chat list") {
      const chats = listChats(repoPath);
      const content =
        chats.length === 0
          ? "No saved chats for this repo yet."
          : `Saved chats:\n\n${chats
              .map(
                (c) =>
                  `- **${c.name}** · ${c.userMessageCount} messages · ${new Date(c.savedAt).toLocaleString()}`,
              )
              .join("\n")}`;
      const msg: Message = { role: "assistant", content, type: "text" };
      setCommitted((prev) => [...prev, msg]);
      setAllMessages((prev) => [...prev, msg]);
      return;
    }

    if (text.trim().toLowerCase().startsWith("/chat load")) {
      const parts = text.trim().split(/\s+/);
      const name = parts.slice(2).join("-");
      if (!name) {
        const chats = listChats(repoPath);
        const content =
          chats.length === 0
            ? "No saved chats found."
            : `Specify a chat name. Recent chats:\n\n${chats
                .slice(0, 10)
                .map((c) => `- **${c.name}**`)
                .join("\n")}`;
        const msg: Message = { role: "assistant", content, type: "text" };
        setCommitted((prev) => [...prev, msg]);
        setAllMessages((prev) => [...prev, msg]);
        return;
      }
      const saved = loadChat(name);
      if (!saved) {
        const msg: Message = {
          role: "assistant",
          content: `Chat **${name}** not found. Use \`/chat list\` to see saved chats.`,
          type: "text",
        };
        setCommitted((prev) => [...prev, msg]);
        setAllMessages((prev) => [...prev, msg]);
        return;
      }
      updateChatName(name);
      setAllMessages(saved.messages);
      setCommitted(saved.messages);
      const notice: Message = {
        role: "assistant",
        content: `Loaded chat **${name}** · ${saved.userMessageCount} messages · saved ${new Date(saved.savedAt).toLocaleString()}`,
        type: "text",
      };
      setCommitted((prev) => [...prev, notice]);
      setAllMessages((prev) => [...prev, notice]);
      return;
    }

    if (
      text.trim().toLowerCase() === "/memory list" ||
      text.trim().toLowerCase() === "/memory"
    ) {
      const mems = listMemories(repoPath);
      const content =
        mems.length === 0
          ? "No memories stored for this repo yet."
          : `Memories for this repo:\n\n${mems
              .map((m) => `- [${m.id}] ${m.content}`)
              .join("\n")}`;
      const msg: Message = { role: "assistant", content, type: "text" };
      setCommitted((prev) => [...prev, msg]);
      setAllMessages((prev) => [...prev, msg]);
      return;
    }

    if (text.trim().toLowerCase().startsWith("/memory add")) {
      const content = text.trim().slice("/memory add".length).trim();
      if (!content) {
        const msg: Message = {
          role: "assistant",
          content: "Usage: `/memory add <content>`",
          type: "text",
        };
        setCommitted((prev) => [...prev, msg]);
        setAllMessages((prev) => [...prev, msg]);
        return;
      }
      const mem = addMemory(content, repoPath);
      const msg: Message = {
        role: "assistant",
        content: `Memory saved **[${mem.id}]**: ${mem.content}`,
        type: "text",
      };
      setCommitted((prev) => [...prev, msg]);
      setAllMessages((prev) => [...prev, msg]);
      return;
    }

    if (text.trim().toLowerCase().startsWith("/memory delete")) {
      const id = text.trim().split(/\s+/)[2];
      if (!id) {
        const msg: Message = {
          role: "assistant",
          content: "Usage: `/memory delete <id>`",
          type: "text",
        };
        setCommitted((prev) => [...prev, msg]);
        setAllMessages((prev) => [...prev, msg]);
        return;
      }
      const deleted = deleteMemory(id, repoPath);
      const msg: Message = {
        role: "assistant",
        content: deleted
          ? `Memory **[${id}]** deleted.`
          : `Memory **[${id}]** not found.`,
        type: "text",
      };
      setCommitted((prev) => [...prev, msg]);
      setAllMessages((prev) => [...prev, msg]);
      return;
    }

    if (text.trim().toLowerCase() === "/memory clear") {
      clearRepoMemory(repoPath);
      const msg: Message = {
        role: "assistant",
        content: "All memories cleared for this repo.",
        type: "text",
      };
      setCommitted((prev) => [...prev, msg]);
      setAllMessages((prev) => [...prev, msg]);
      return;
    }

    const userMsg: Message = { role: "user", content: text, type: "text" };
    const nextAll = [...allMessages, userMsg];
    setCommitted((prev) => [...prev, userMsg]);
    setAllMessages(nextAll);
    // Do NOT clear toolResultCache here — safe tool results (read-file, read-folder, grep)
    // persist across the whole session so the model never re-reads the same resource twice.
    batchApprovedRef.current = false;

    inputHistoryRef.current = [
      text,
      ...inputHistoryRef.current.filter((m) => m !== text),
    ].slice(0, 50);
    historyIndexRef.current = -1;

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
    callChat(provider, systemPrompt, nextAll, abort.signal)
      .then((raw: string) => processResponse(raw, nextAll, abort.signal))
      .catch(handleError(nextAll));
  };

  useInput((input, key) => {
    if (showTimeline) return;

    // Esc cancels the force-all warning
    if (showForceWarning && key.escape) {
      setShowForceWarning(false);
      return;
    }

    if (stage.type === "thinking" && key.escape) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      batchApprovedRef.current = false;
      setStage({ type: "idle" });
      return;
    }

    if (stage.type === "idle") {
      if (key.ctrl && input === "c") {
        process.exit(0);
        return;
      }
      if (key.upArrow && inputHistoryRef.current.length > 0) {
        const next = Math.min(
          historyIndexRef.current + 1,
          inputHistoryRef.current.length - 1,
        );
        historyIndexRef.current = next;
        setInputValue(inputHistoryRef.current[next]!);
        setInputKey((k) => k + 1);
        return;
      }
      if (key.downArrow) {
        const next = historyIndexRef.current - 1;
        historyIndexRef.current = next;
        setInputValue(next < 0 ? "" : inputHistoryRef.current[next]!);
        setInputKey((k) => k + 1);
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
            appendMemory({
              kind: "url-fetched",
              detail: repoUrl,
              summary: `Cloned ${repoName} — ${fileCount} files`,
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
        setStage({ type: "cloning", repoUrl });
        startCloneRepo(toCloneUrl(repoUrl), { forceReclone: true }).then(
          (result) => {
            if (result.done) {
              setStage({
                type: "clone-done",
                repoUrl,
                destPath: existingPath,
                fileCount: walkDir(existingPath).length,
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
          },
        );
        return;
      }
      if (input === "n" || input === "N") {
        const { repoUrl, repoPath: existingPath } = stage;
        setStage({
          type: "clone-done",
          repoUrl,
          destPath: existingPath,
          fileCount: walkDir(existingPath).length,
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
            result: `Clone complete. Repo: ${repoName}. Local path: ${stage.destPath}. ${stage.fileCount} files.`,
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
        batchApprovedRef.current = false;
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
            appendMemory({
              kind: "code-skipped",
              detail: msg.patches
                .map((p: { path: string }) => p.path)
                .join(", "),
              summary: `Skipped changes to ${msg.patches.length} file(s)`,
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
          appendMemory({
            kind: "code-applied",
            detail: stage.patches.map((p) => p.path).join(", "),
            summary: `Applied changes to ${stage.patches.length} file(s)`,
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
        const historySummary = buildMemorySummary(repoPath);
        const lensFile = readLensFile(repoPath);
        const lensContext = lensFile
          ? `\n\n## LENS.md (previous analysis)\n${lensFile.overview}\n\nImportant folders: ${lensFile.importantFolders.join(", ")}\nSuggestions: ${lensFile.suggestions.slice(0, 3).join("; ")}`
          : "";
        const toolsSection = registry.buildSystemPromptSection();
        setSystemPrompt(
          buildSystemPrompt(importantFiles, historySummary, toolsSection) +
            lensContext,
        );
        const greeting: Message = {
          role: "assistant",
          content: `Welcome to Lens\nCodebase loaded — ${importantFiles.length} files indexed.${historySummary ? "\n\nI have memory of previous actions in this repo." : ""}${lensFile ? "\n\nFound LENS.md — I have context from a previous analysis of this repo." : ""}\nAsk me anything, tell me what to build, share a URL, or ask me to read/write files.\n\nTip: type /timeline to browse commit history.`,
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
  if (stage.type === "loading")
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
  if (showTimeline)
    return (
      <TimelineRunner
        repoPath={repoPath}
        onExit={() => setShowTimeline(false)}
      />
    );
  if (showReview)
    return (
      <ReviewCommand path={repoPath} onExit={() => setShowReview(false)} />
    );
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

      {/* Force-all warning overlay */}
      {showForceWarning && (
        <ForceAllWarning
          onConfirm={(confirmed) => {
            setShowForceWarning(false);
            if (confirmed) {
              setForceApprove(true);
              setAutoApprove(true);
              const msg: Message = {
                role: "assistant",
                content:
                  "⚡⚡ Force-all mode ON — ALL tools auto-approved including shell and writes. Type /auto --force-all again to disable.",
                type: "text",
              };
              setCommitted((prev) => [...prev, msg]);
              setAllMessages((prev) => [...prev, msg]);
            } else {
              const msg: Message = {
                role: "assistant",
                content: "Force-all cancelled.",
                type: "text",
              };
              setCommitted((prev) => [...prev, msg]);
              setAllMessages((prev) => [...prev, msg]);
            }
          }}
        />
      )}

      {!showForceWarning && stage.type === "thinking" && (
        <Box gap={1}>
          <Text color={ACCENT}>●</Text>
          <TypewriterText text={thinkingPhrase} />
          <Text color="gray" dimColor>
            · esc cancel
          </Text>
        </Box>
      )}

      {!showForceWarning && stage.type === "permission" && (
        <PermissionPrompt tool={stage.tool} onDecide={stage.resolve} />
      )}

      {!showForceWarning && stage.type === "idle" && (
        <Box flexDirection="column">
          {inputValue.startsWith("/") && (
            <CommandPalette
              query={inputValue}
              onSelect={(cmd) => setInputValue(cmd)}
              recentChats={recentChats}
            />
          )}
          <InputBox
            value={inputValue}
            onChange={(v) => {
              historyIndexRef.current = -1;
              setInputValue(v);
            }}
            onSubmit={(val) => {
              if (val.trim()) sendMessage(val.trim());
              setInputValue("");
            }}
            inputKey={inputKey}
          />
          <ShortcutBar autoApprove={autoApprove} forceApprove={forceApprove} />
        </Box>
      )}
    </Box>
  );
};
