import { Box, Text, useInput } from "ink";
import figures from "figures";
import { useState } from "react";
import type { ProviderType } from "../../types/config";

const OPTIONS: { type: ProviderType; label: string; description: string }[] = [
  { type: "anthropic", label: "Anthropic", description: "Claude models" },
  { type: "openai", label: "OpenAI", description: "GPT models" },
  { type: "ollama", label: "Ollama", description: "Local models" },
  {
    type: "custom",
    label: "Custom provider",
    description: "Any OpenAI-compatible API",
  },
];

export const ProviderTypeStep = ({
  onSelect,
}: {
  onSelect: (type: ProviderType) => void;
}) => {
  const [index, setIndex] = useState(0);

  useInput((_, key) => {
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(OPTIONS.length - 1, i + 1));
    if (key.return) onSelect(OPTIONS[index]!.type);
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="cyan">
        Select a provider
      </Text>
      {OPTIONS.map((opt, i) => {
        const selected = i === index;
        return (
          <Box key={opt.type} marginLeft={1}>
            <Text color={selected ? "cyan" : "white"}>
              {selected ? figures.arrowRight : " "}
              {"  "}
              <Text bold={selected}>{opt.label}</Text>
              <Text color="gray">
                {"  "}
                {opt.description}
              </Text>
            </Text>
          </Box>
        );
      })}
      <Text color="gray">↑↓ navigate · enter to select</Text>
    </Box>
  );
};
