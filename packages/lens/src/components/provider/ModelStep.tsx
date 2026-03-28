import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import type { Provider } from "@ridit/lens-core";
import { ACCENT } from "../../colors";

const DEFAULT_MODELS: Partial<Record<Provider, string[]>> = {
  anthropic: [
    "claude-sonnet-4-5-20250514",
    "claude-opus-4-5-20250514",
    "claude-haiku-4-5-20251001",
  ],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  google: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  openrouter: ["openai/gpt-4o", "openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet"],
  ollama: ["llama3.2", "llama3.1", "mistral", "codellama", "phi3"],
  custom: [],
};

export function ModelStep({
  providerType,
  onSelect,
}: {
  providerType: Provider;
  onSelect: (model: string) => void;
}) {
  const models = DEFAULT_MODELS[providerType] ?? [];
  const [index, setIndex] = useState(0);
  const [custom, setCustom] = useState("");
  const [typing, setTyping] = useState(models.length === 0);

  useInput((input, key) => {
    if (typing) {
      if (key.return && custom.trim()) {
        onSelect(custom.trim());
        return;
      }
      if (key.backspace || key.delete) {
        setCustom((v) => v.slice(0, -1));
        return;
      }
      if (!key.ctrl && !key.meta && input) setCustom((v) => v + input);
      return;
    }
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(models.length, i + 1));
    if (key.return) {
      if (index === models.length) setTyping(true);
      else onSelect(models[index]!);
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={ACCENT}>
        Select a model
      </Text>
      {models.map((m, i) => {
        const selected = !typing && i === index;
        return (
          <Box key={m} marginLeft={1}>
            <Text color={selected ? ACCENT : "white"}>
              {selected ? figures.arrowRight : " "}
              {"  "}
              {m}
            </Text>
          </Box>
        );
      })}
      <Box marginLeft={1}>
        <Text color={index === models.length && !typing ? ACCENT : "gray"}>
          {index === models.length && !typing ? figures.arrowRight : " "}
          {"  "}
          {typing ? (
            <Text>
              Model name:{" "}
              <Text color="white">{custom || " "}</Text>
            </Text>
          ) : (
            "Enter custom model name"
          )}
        </Text>
      </Box>
      <Text color="gray" dimColor>
        ↑↓ navigate · enter to select
      </Text>
    </Box>
  );
}
