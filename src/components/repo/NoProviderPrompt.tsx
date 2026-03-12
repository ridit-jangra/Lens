import React from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";

export const NoProviderPrompt = ({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) => {
  useInput((input, key) => {
    if (input === "y" || input === "Y" || key.return) onAccept();
    if (input === "n" || input === "N" || key.escape) onDecline();
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">{figures.warning} No API provider configured.</Text>
      <Text>
        Run setup now?{"  "}
        <Text color="green">[y] yes</Text>
        {"  "}
        <Text color="red">[n] skip</Text>
      </Text>
    </Box>
  );
};
