import { Box, Text, useInput } from "ink";
import figures from "figures";
import { useState } from "react";
import { DEFAULT_MODELS } from "../../utils/config";
import type { ProviderType } from "../../types/config";

export const ModelStep = ({
  providerType,
  onSelect,
}: {
  providerType: ProviderType;
  onSelect: (model: string) => void;
}) => {
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
    if (key.downArrow) setIndex((i) => Math.min(models.length, i + 1)); // last = custom
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
        <Text color={index === models.length && !typing ? "cyan" : "gray"}>
          {index === models.length && !typing ? figures.arrowRight : " "}
          {"  "}
          {typing ? (
            <Text>
              Custom: <Text color="white">{custom || " "}</Text>
            </Text>
          ) : (
            "Enter custom model name"
          )}
        </Text>
      </Box>
      <Text color="gray">↑↓ navigate · enter to select</Text>
    </Box>
  );
};
