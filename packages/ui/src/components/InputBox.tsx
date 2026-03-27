import React, { useState, useEffect } from "react";
import { Box, Text, useStdout } from "ink";
import { TextArea } from "./TextArea";

const ACCENT = "cyan";

export function InputBox({
  value,
  onChange,
  onSubmit,
  inputKey,
  placeholder = "ask anything...",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  inputKey?: number;
  placeholder?: string;
}) {
  const { stdout } = useStdout();
  const [cols, setCols] = useState(stdout?.columns ?? 80);

  useEffect(() => {
    const handler = () => setCols(stdout?.columns ?? 80);
    stdout?.on("resize", handler);
    return () => {
      stdout?.off("resize", handler);
    };
  }, [stdout]);

  const rule = "─".repeat(Math.max(1, cols - 4));

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" dimColor>
        {rule}
      </Text>
      <Box gap={1}>
        <Text color={ACCENT}>{">"}</Text>
        <TextArea
          key={inputKey}
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={placeholder}
        />
      </Box>
      <Text color="gray" dimColor>
        {rule}
      </Text>
    </Box>
  );
}

export function ShortcutBar({ isLoading }: { isLoading?: boolean }) {
  return (
    <Box gap={3}>
      <Text color="gray" dimColor>
        enter send · shift+enter newline · ctrl+← → word · ^c exit
      </Text>
      {isLoading && <Text color="yellow">thinking... (esc to interrupt)</Text>}
    </Box>
  );
}
