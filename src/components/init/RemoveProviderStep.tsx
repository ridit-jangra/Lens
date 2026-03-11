// components/config/RemoveProviderStep.tsx
import { Box, Text, useInput } from "ink";
import figures from "figures";
import { useState } from "react";
import { loadConfig, saveConfig } from "../../utils/config";
import type { Provider } from "../../types/config";

export const RemoveProviderStep = ({ onDone }: { onDone: () => void }) => {
  const config = loadConfig();
  const providers = config.providers;
  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);

  useInput((input, key) => {
    if (confirming) {
      if (input === "y" || input === "Y") {
        const updated = {
          ...config,
          providers: providers.filter((_, i) => i !== index),
          defaultProviderId:
            config.defaultProviderId === providers[index]?.id
              ? providers.find((_, i) => i !== index)?.id
              : config.defaultProviderId,
        };
        saveConfig(updated);
        onDone();
      } else {
        setConfirming(false);
      }
      return;
    }

    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(providers.length - 1, i + 1));
    if (key.return) setConfirming(true);
    if (key.escape) onDone();
  });

  if (providers.length === 0) {
    return (
      <Box marginTop={1}>
        <Text color="gray">{figures.info} No providers configured.</Text>
      </Box>
    );
  }

  const selected = providers[index];

  if (confirming && selected) {
    return (
      <Box flexDirection="column" gap={1} marginTop={1}>
        <Text color="red">
          {figures.warning} Remove <Text bold>{selected.name}</Text>? (y/n)
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1} marginTop={1}>
      <Text bold color="cyan">
        Remove a provider
      </Text>
      {providers.map((p, i) => {
        const isSelected = i === index;
        return (
          <Box key={p.id} marginLeft={1}>
            <Text color={isSelected ? "red" : "white"}>
              {isSelected ? figures.arrowRight : " "}
              {"  "}
              <Text bold={isSelected}>{p.name}</Text>
              <Text color="gray">
                {"  "}
                {p.type} · {p.model}
                {config.defaultProviderId === p.id ? " · default" : ""}
              </Text>
            </Text>
          </Box>
        );
      })}
      <Text color="gray">↑↓ navigate · enter to remove · esc to cancel</Text>
    </Box>
  );
};
