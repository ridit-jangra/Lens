import React, { useState, useEffect } from "react";
import { Box, Text, useStdout } from "ink";
import { TextArea } from "./TextArea";
import { ACCENT } from "../colors";

export function InputBox({
  value,
  onChange,
  onSubmit,
  inputKey,
  placeholder = "ask anything...",
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  inputKey?: number;
  placeholder?: string;
  disabled?: boolean;
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
        <Text color={disabled ? "gray" : ACCENT} dimColor={disabled}>
          ◆
        </Text>
        <TextArea
          key={inputKey}
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={disabled ? "waiting..." : placeholder}
          focus={!disabled}
        />
      </Box>
    </Box>
  );
}

export function ShortcutBar() {
  return (
    <Box>
      <Text color="gray" dimColor>
        ↵ send · ⇧↵ newline · ^←→ word · ^c quit
      </Text>
    </Box>
  );
}
