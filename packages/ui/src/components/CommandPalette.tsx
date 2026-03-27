import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";

export interface Command {
  name: string;
  description: string;
  alias?: string;
}

interface CommandPaletteProps {
  commands: Command[];
  query?: string;
  onSelect: (command: string) => void;
  isOpen: boolean;
}

export function CommandPalette({
  commands,
  query,
  onSelect,
  isOpen,
}: CommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filtered, setFiltered] = useState<Command[]>(commands);

  useEffect(() => {
    if (query) {
      const q = query.replace("/", "").toLowerCase();
      setFiltered(commands.filter((c) => c.name.toLowerCase().includes(q)));
      setSelectedIndex(0);
    } else {
      setFiltered(commands);
    }
  }, [query]);

  useInput((input, key) => {
    if (!isOpen) return;

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(filtered.length - 1, prev + 1));
    } else if (key.return) {
      onSelect(filtered[selectedIndex]?.name ?? "");
    } else if (key.escape) {
      onSelect("");
    }
  });

  if (!isOpen || filtered.length === 0) return null;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray">
      {filtered.slice(0, 5).map((command, index) => (
        <Box key={command.name} gap={2}>
          <Text color={index === selectedIndex ? "cyan" : "white"}>
            {command.name}
          </Text>
          <Text color="gray">{command.description}</Text>
        </Box>
      ))}
    </Box>
  );
}
