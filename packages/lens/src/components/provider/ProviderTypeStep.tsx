import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import type { Provider } from "@ridit/lens-core";
import { ACCENT } from "../../colors";

const OPTIONS: { type: Provider; label: string; description: string }[] = [
  { type: "anthropic", label: "Anthropic", description: "Claude models" },
  { type: "openai", label: "OpenAI", description: "GPT models" },
  { type: "google", label: "Google", description: "Gemini models" },
  { type: "groq", label: "Groq", description: "Fast open-source models" },
  { type: "openrouter", label: "OpenRouter", description: "Multi-provider gateway" },
  { type: "ollama", label: "Ollama", description: "Local models" },
  { type: "custom", label: "Custom", description: "Any OpenAI-compatible API" },
];

export function ProviderTypeStep({
  onSelect,
}: {
  onSelect: (type: Provider) => void;
}) {
  const [index, setIndex] = useState(0);

  useInput((_, key) => {
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(OPTIONS.length - 1, i + 1));
    if (key.return) onSelect(OPTIONS[index]!.type);
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={ACCENT}>
        Select a provider
      </Text>
      {OPTIONS.map((opt, i) => {
        const selected = i === index;
        return (
          <Box key={opt.type} marginLeft={1}>
            <Text color={selected ? ACCENT : "white"}>
              {selected ? figures.arrowRight : " "}
              {"  "}
              <Text bold={selected}>{opt.label}</Text>
              <Text color="gray">{"  "}{opt.description}</Text>
            </Text>
          </Box>
        );
      })}
      <Text color="gray" dimColor>
        ↑↓ navigate · enter to select
      </Text>
    </Box>
  );
}
