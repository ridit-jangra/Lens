import React, { useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useState } from "react";

interface InputProps {
  onSubmit?: (value: string) => void;
  placeholder?: string;
}

export function Input({
  onSubmit = (value) => {
    console.log(value);
  },
  placeholder = "Enter...",
}: InputProps) {
  const [value, setValue] = useState<string>("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(history.length);
  const [cursorVisible, setCursorVisible] = useState<boolean>(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useInput((input, key) => {
    if (key.delete) {
      setValue((prev) => prev.slice(0, -1));
    } else if (key.ctrl && input === "w") {
      setValue((prev) => prev.split(" ").slice(0, -1).join(" "));
    } else if (key.ctrl && input === "j") {
      setValue((prev) => prev + "\n");
    } else if (key.return) {
      setHistory((prev) => [...prev, value]);
      setValue("");
      setHistoryIndex(history.length + 1);
      onSubmit(value);
    } else if (key.upArrow) {
      if (historyIndex === 0) {
        setValue("");
      } else {
        const newIndex = Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setValue(history[newIndex] ?? "");
      }
    } else if (key.downArrow) {
      if (historyIndex === -1) {
        setValue("");
      } else {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length)
          (setValue(""), setHistoryIndex(history.length));
        else (setValue(history[newIndex]), setHistoryIndex(newIndex));
      }
    } else {
      setValue((prev) => prev + input);
    }
  });

  return (
    <Box>
      {value === "" ? (
        <Text color={"gray"}>{placeholder}</Text>
      ) : (
        <Box>
          <Text>{value}</Text>
          <Text>{cursorVisible ? "█" : " "}</Text>
        </Box>
      )}
    </Box>
  );
}
