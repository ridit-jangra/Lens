import { useState, useRef } from "react";
import { useInput } from "ink";
import { COMMANDS } from "./useCommandHandlers";
import type { ChatStage } from "../../../types/chat";

export function useChatInput(
  stage: ChatStage,
  showTimeline: boolean,
  showForceWarning: boolean,
  onAbortThinking: () => void,
  onStageKeyInput: (input: string, key: any) => void,
) {
  const [inputValue, setInputValue] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const inputHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const pushHistory = (text: string) => {
    inputHistoryRef.current = [
      text,
      ...inputHistoryRef.current.filter((m) => m !== text),
    ].slice(0, 50);
    historyIndexRef.current = -1;
  };

  useInput((input, key) => {
    if (showTimeline) return;

    if (showForceWarning && key.escape) {
      onStageKeyInput(input, key);
      return;
    }

    if (stage.type === "thinking" && key.escape) {
      onAbortThinking();
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

    // Delegate all other stage key handling to the parent
    onStageKeyInput(input, key);
  });

  return {
    inputValue,
    setInputValue,
    inputKey,
    pushHistory,
  };
}
