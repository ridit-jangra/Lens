import React, { useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { type Command, CommandPalette } from "./CommandPalette";

interface InputProps {
  onSubmit?: (value: string) => void;
  placeholder?: string;
  commands?: Command[];
}

export function Input({
  onSubmit = (value) => {
    console.log(value);
  },
  placeholder = "Enter...",
  commands,
}: InputProps) {
  const [value, setValue] = useState<string>("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [cursorVisible, setCursorVisible] = useState<boolean>(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useInput((input, key) => {
    const isCommandOpen = value.startsWith("/");

    if (key.delete) {
      setValue((prev) => prev.slice(0, -1));
    } else if (key.ctrl && input === "w") {
      setValue((prev) => prev.split(" ").slice(0, -1).join(" "));
    } else if (key.ctrl && input === "j") {
      setValue((prev) => prev + "\n");
    } else if (key.return) {
      if (isCommandOpen) return;
      setHistory((prev) => [...prev, value]);
      setValue("");
      setHistoryIndex(history.length + 1);
      onSubmit(value);
    } else if (key.upArrow) {
      if (isCommandOpen) return;
      if (historyIndex === 0) {
        setValue("");
      } else {
        const newIndex = Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setValue(history[newIndex] ?? "");
      }
    } else if (key.downArrow) {
      if (isCommandOpen) return;
      const newIndex = historyIndex + 1;
      if (newIndex >= history.length) {
        setValue("");
        setHistoryIndex(history.length);
      } else {
        setValue(history[newIndex]);
        setHistoryIndex(newIndex);
      }
    } else if (key.escape) {
      setValue("");
    } else {
      if (input && input !== "\r" && input !== "\n") {
        setValue((prev) => prev + input);
      }
    }
  });

  const isCommandOpen = value.startsWith("/");

  return (
    <Box flexDirection="column">
      {value === "" ? (
        <Text color="gray">{placeholder}</Text>
      ) : (
        <Text>
          {value}
          {cursorVisible ? "█" : " "}
        </Text>
      )}
      {isCommandOpen && commands && (
        <CommandPalette
          commands={commands}
          query={value}
          isOpen={isCommandOpen}
          onSelect={(cmd) => {
            if (cmd) setValue(cmd + " ");
            else setValue("");
          }}
        />
      )}
    </Box>
  );
}
