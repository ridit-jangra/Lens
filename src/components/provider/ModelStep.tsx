import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import figures from "figures";
import { useState } from "react";
import { DEFAULT_MODELS } from "../../utils/config";
import type { ProviderType } from "../../types/config";
import { TEXT } from "../../colors";

export const ModelStep = ({
  providerType,
  onSelect,
  onBack,
}: {
  providerType: ProviderType;
  onSelect: (model: string) => void;
  onBack?: () => void;
}) => {
  const models = DEFAULT_MODELS[providerType] ?? [];
  const [index, setIndex] = useState(0);
  const [custom, setCustom] = useState("");
  const [typing, setTyping] = useState(models.length === 0);

  useInput((_, key) => {
    if (key.escape) {
      if (typing && models.length > 0) {
        setTyping(false);
        return;
      }
      onBack?.();
      return;
    }
    if (typing) return;
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(models.length, i + 1));
    if (key.return) {
      if (index === models.length) setTyping(true);
      else onSelect(models[index]!);
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="cyan">
        Select a model
      </Text>
      {models.map((m, i) => {
        const selected = !typing && i === index;
        return (
          <Box key={m} marginLeft={1}>
            <Text color={selected ? "cyan" : "white"}>
              {selected ? figures.arrowRight : " "}
              {"  "}
              {m}
            </Text>
          </Box>
        );
      })}
      <Box marginLeft={1}>
        {typing ? (
          <Box gap={1}>
            <Text color={TEXT}>
              {figures.arrowRight}
              {"  "}Custom:{" "}
            </Text>
            <TextInput
              value={custom}
              onChange={setCustom}
              onSubmit={(v) => {
                if (v.trim()) onSelect(v.trim());
              }}
              placeholder="enter model name"
            />
          </Box>
        ) : (
          <Text color={index === models.length ? "cyan" : "gray"}>
            {index === models.length ? figures.arrowRight : " "}
            {"  "}Enter custom model name
          </Text>
        )}
      </Box>
      <Text color="gray">
        {typing
          ? "enter to confirm · esc back"
          : `↑↓ navigate · enter to select${onBack ? " · esc back" : ""}`}
      </Text>
    </Box>
  );
};
