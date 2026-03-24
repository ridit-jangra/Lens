import React from "react";
import { Box, Text, Static, useInput } from "ink";
import Spinner from "ink-spinner";
import { useState } from "react";
import path from "path";
import os from "os";
import TextInput from "ink-text-input";
import { ACCENT } from "../../colors";
import { ProviderPicker } from "../provider/ProviderPicker";
import { startCloneRepo } from "../../utils/repo";
import { useThinkingPhrase } from "../../utils/thinking";
import { walkDir, applyPatches, toCloneUrl } from "../../utils/chat";
import { appendMemory } from "../../utils/memory";
import { getChatNameSuggestions, saveChat } from "../../utils/chatHistory";
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
import { ReviewCommand } from "../../commands/review";
import type { Message } from "../../types/chat";
import { useChat } from "./hooks/useChat";
import { useChatInput } from "./hooks/useChatInput";
import { handleCommand, COMMANDS } from "./hooks/useCommandHandlers";

function CommandPalette({
  query,
  recentChats,
}: {
  query: string;
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
  const chat = useChat(repoPath);
  const thinkingPhrase = useThinkingPhrase(chat.stage.type === "thinking");

  const handleStageKey = (input: string, key: any) => {
    const { stage } = chat;

    if (chat.showForceWarning && key.escape) {
      chat.setShowForceWarning(false);
      return;
    }

    if (stage.type === "clone-offer") {
      if (input === "y" || input === "Y" || key.return) {
        const { repoUrl } = stage;
        const launch = stage.launchAnalysis ?? false;
        const cloneUrl = toCloneUrl(repoUrl);
        chat.setStage({ type: "cloning", repoUrl });
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
            chat.setClonedUrls((prev) => new Set([...prev, repoUrl]));
            chat.setStage({
              type: "clone-done",
              repoUrl,
              destPath,
              fileCount,
              launchAnalysis: launch,
            });
          } else if (result.folderExists && result.repoPath) {
            chat.setStage({
              type: "clone-exists",
              repoUrl,
              repoPath: result.repoPath,
            });
          } else {
            chat.setStage({
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
        chat.setStage({ type: "idle" });
      return;
    }

    if (stage.type === "clone-exists") {
      if (input === "y" || input === "Y") {
        const { repoUrl, repoPath: existingPath } = stage;
        chat.setStage({ type: "cloning", repoUrl });
        startCloneRepo(toCloneUrl(repoUrl), { forceReclone: true }).then(
          (result) => {
            if (result.done) {
              chat.setStage({
                type: "clone-done",
                repoUrl,
                destPath: existingPath,
                fileCount: walkDir(existingPath).length,
              });
            } else {
              chat.setStage({
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
        chat.setStage({
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
          chat.setAllMessages([...chat.allMessages, contextMsg, summaryMsg]);
          chat.setCommitted((prev) => [...prev, summaryMsg]);
          chat.setStage({ type: "idle" });
        } else {
          chat.setStage({ type: "idle" });
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
        chat.batchApprovedRef.current = false;
        stage.resolve(false);
        return;
      }
      return;
    }

    if (stage.type === "preview") {
      if (key.upArrow) {
        chat.setStage({
          ...stage,
          scrollOffset: Math.max(0, stage.scrollOffset - 1),
        });
        return;
      }
      if (key.downArrow) {
        chat.setStage({ ...stage, scrollOffset: stage.scrollOffset + 1 });
        return;
      }
      if (key.escape || input === "s" || input === "S") {
        if (chat.pendingMsgIndex !== null) {
          const msg = chat.allMessages[chat.pendingMsgIndex];
          if (msg?.type === "plan") {
            chat.setCommitted((prev) => [...prev, { ...msg, applied: false }]);
            chat.skipPatches(msg.patches);
          }
        }
        chat.setPendingMsgIndex(null);
        chat.setStage({ type: "idle" });
        return;
      }
      if (key.return || input === "a" || input === "A") {
        if (chat.pendingMsgIndex !== null) {
          const msg = chat.allMessages[chat.pendingMsgIndex];
          if (msg?.type === "plan") {
            chat.applyPatchesAndContinue(msg.patches);
            const applied: Message = { ...msg, applied: true };
            chat.setAllMessages((prev) =>
              prev.map((m, i) => (i === chat.pendingMsgIndex ? applied : m)),
            );
            chat.setCommitted((prev) => [...prev, applied]);
          }
        }
        chat.setPendingMsgIndex(null);
        chat.setStage({ type: "idle" });
        return;
      }
    }

    if (stage.type === "viewing-file") {
      if (key.upArrow) {
        chat.setStage({
          ...stage,
          scrollOffset: Math.max(0, stage.scrollOffset - 1),
        });
        return;
      }
      if (key.downArrow) {
        chat.setStage({ ...stage, scrollOffset: stage.scrollOffset + 1 });
        return;
      }
      if (key.escape || key.return) {
        chat.setStage({ type: "idle" });
        return;
      }
    }
  };

  const chatInput = useChatInput(
    chat.stage,
    chat.showTimeline,
    chat.showForceWarning,
    chat.abortThinking,
    handleStageKey,
  );

  const sendMessage = (text: string) => {
    if (!chat.provider) return;

    const handled = handleCommand(text, {
      repoPath,
      allMessages: chat.allMessages,
      autoApprove: chat.autoApprove,
      forceApprove: chat.forceApprove,
      chatName: chat.chatName,
      chatNameRef: chat.chatNameRef,
      setShowTimeline: chat.setShowTimeline,
      setShowReview: chat.setShowReview,
      setShowForceWarning: chat.setShowForceWarning,
      setForceApprove: chat.setForceApprove,
      setAutoApprove: chat.setAutoApprove,
      setAllMessages: chat.setAllMessages as any,
      setCommitted: chat.setCommitted as any,
      setRecentChats: chat.setRecentChats,
      updateChatName: chat.updateChatName,
    });

    if (handled) return;

    chatInput.pushHistory(text);
    chat.sendMessage(text, chat.provider, chat.systemPrompt, chat.allMessages);

    if (!chat.chatName) {
      const name =
        getChatNameSuggestions([
          ...chat.allMessages,
          { role: "user", content: text, type: "text" },
        ])[0] ?? `chat-${new Date().toISOString().slice(0, 10)}`;
      chat.updateChatName(name);
      chat.setRecentChats((prev) =>
        [name, ...prev.filter((n) => n !== name)].slice(0, 10),
      );
    }
  };

  const { stage } = chat;

  if (stage.type === "picking-provider")
    return <ProviderPicker onDone={chat.handleProviderDone} />;
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
  if (chat.showTimeline)
    return (
      <TimelineRunner
        repoPath={repoPath}
        onExit={() => chat.setShowTimeline(false)}
      />
    );
  if (chat.showReview)
    return (
      <ReviewCommand path={repoPath} onExit={() => chat.setShowReview(false)} />
    );
  if (stage.type === "clone-offer")
    return <CloneOfferView stage={stage} committed={chat.committed} />;
  if (stage.type === "cloning")
    return <CloningView stage={stage} committed={chat.committed} />;
  if (stage.type === "clone-exists")
    return <CloneExistsView stage={stage} committed={chat.committed} />;
  if (stage.type === "clone-done")
    return <CloneDoneView stage={stage} committed={chat.committed} />;
  if (stage.type === "clone-error")
    return <CloneErrorView stage={stage} committed={chat.committed} />;
  if (stage.type === "preview")
    return <PreviewView stage={stage} committed={chat.committed} />;
  if (stage.type === "viewing-file")
    return <ViewingFileView stage={stage} committed={chat.committed} />;

  return (
    <Box flexDirection="column">
      <Static items={chat.committed}>
        {(msg, i) => <StaticMessage key={i} msg={msg} />}
      </Static>

      {chat.showForceWarning && (
        <ForceAllWarning
          onConfirm={(confirmed) => {
            chat.setShowForceWarning(false);
            if (confirmed) {
              chat.setForceApprove(true);
              chat.setAutoApprove(true);
              const msg: Message = {
                role: "assistant",
                content:
                  "⚡⚡ Force-all mode ON — ALL tools auto-approved including shell and writes. Type /auto --force-all again to disable.",
                type: "text",
              };
              chat.setCommitted((prev) => [...prev, msg]);
              chat.setAllMessages((prev: Message[]) => [...prev, msg]);
            } else {
              const msg: Message = {
                role: "assistant",
                content: "Force-all cancelled.",
                type: "text",
              };
              chat.setCommitted((prev) => [...prev, msg]);
              chat.setAllMessages((prev: Message[]) => [...prev, msg]);
            }
          }}
        />
      )}

      {!chat.showForceWarning && stage.type === "thinking" && (
        <Box gap={1}>
          <Text color={ACCENT}>●</Text>
          <TypewriterText text={thinkingPhrase} />
          <Text color="gray" dimColor>
            · esc cancel
          </Text>
        </Box>
      )}

      {!chat.showForceWarning && stage.type === "permission" && (
        <PermissionPrompt tool={stage.tool} onDecide={stage.resolve} />
      )}

      {!chat.showForceWarning && stage.type === "idle" && (
        <Box flexDirection="column">
          {chatInput.inputValue.startsWith("/") && (
            <CommandPalette
              query={chatInput.inputValue}
              recentChats={chat.recentChats}
            />
          )}
          <InputBox
            value={chatInput.inputValue}
            onChange={(v) => chatInput.setInputValue(v)}
            onSubmit={(val) => {
              if (val.trim()) sendMessage(val.trim());
              chatInput.setInputValue("");
            }}
            inputKey={chatInput.inputKey}
          />
          <ShortcutBar
            autoApprove={chat.autoApprove}
            forceApprove={chat.forceApprove}
          />
        </Box>
      )}
    </Box>
  );
};
