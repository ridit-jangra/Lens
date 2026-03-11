import { Box, Text, useInput } from "ink";
import figures from "figures";
import { useEffect, useState } from "react";
import { loadConfig } from "../../utils/config";
import type { Provider } from "../../types/config";

export const ProviderPicker = ({
  onDone,
}: {
  onDone: (provider: Provider) => void;
}) => {
  const [index, setIndex] = useState(0);
  const config = loadConfig();
  const providers = config.providers;

  useEffect(() => {
    if (providers.length === 1) {
      onDone(providers[0]!);
    }
  }, []);

  useInput((_, key) => {
    if (providers.length <= 1) return;
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(providers.length - 1, i + 1));
    if (key.return) {
      onDone(providers[index]!);
    }
  });

  if (providers.length === 0) {
    return (
      <Box marginTop={1}>
        <Text color="red">
          {figures.cross} No providers configured. Run{" "}
          <Text color="cyan">lens init</Text> first.
        </Text>
      </Box>
    );
  }

  if (providers.length === 1) {
    return (
      <Box marginTop={1}>
        <Text color="gray">
          {figures.arrowRight} Using{" "}
          <Text color="cyan">{providers[0]!.name}</Text>
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1} gap={1}>
      <Text bold color="cyan">
        Select provider
      </Text>
      {providers.map((p, i) => (
        <Box key={p.id} marginLeft={1}>
          <Text color={i === index ? "cyan" : "white"}>
            {i === index ? figures.arrowRight : " "}
            {"  "}
            <Text bold={i === index}>{p.name}</Text>
            <Text color="gray">
              {"  "}
              {p.type} · {p.model}
              {config.defaultProviderId === p.id ? " · default" : ""}
            </Text>
          </Text>
        </Box>
      ))}
      <Text color="gray">↑↓ navigate · enter to select</Text>
    </Box>
  );
};
