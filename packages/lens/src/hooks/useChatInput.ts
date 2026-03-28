import { useState, useRef } from "react";

export function useChatInput(initialMessage?: string) {
  const [inputValue, setInputValue] = useState(initialMessage ?? "");
  const [inputKey, setInputKey] = useState(0);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const pushHistory = (text: string) => {
    historyRef.current = [
      text,
      ...historyRef.current.filter((m) => m !== text),
    ].slice(0, 50);
    historyIndexRef.current = -1;
  };

  const historyUp = () => {
    if (historyRef.current.length === 0) return;
    const next = Math.min(
      historyIndexRef.current + 1,
      historyRef.current.length - 1,
    );
    historyIndexRef.current = next;
    setInputValue(historyRef.current[next]!);
    setInputKey((k) => k + 1);
  };

  const historyDown = () => {
    const next = historyIndexRef.current - 1;
    historyIndexRef.current = next;
    setInputValue(next < 0 ? "" : historyRef.current[next]!);
    setInputKey((k) => k + 1);
  };

  const clear = () => {
    setInputValue("");
    setInputKey((k) => k + 1);
  };

  return {
    inputValue,
    setInputValue,
    inputKey,
    pushHistory,
    historyUp,
    historyDown,
    clear,
  };
}
