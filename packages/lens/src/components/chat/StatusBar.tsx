import React, { useState, useEffect } from "react";
import { Box, Text, useStdout } from "ink";
import Spinner from "ink-spinner";
import { resolve } from "path";
import { homedir } from "os";
import { TextArea } from "./TextArea";
import { ACCENT, GREEN, RED } from "../../colors";

export function AppHeader({
  model,
  repoPath,
}: {
  model: string;
  repoPath: string;
}) {
  const cols = process.stdout.columns ?? 80;
  const rule = "─".repeat(Math.max(1, cols));
  const abs = resolve(repoPath);
  const displayPath = abs.startsWith(homedir())
    ? "~" + abs.slice(homedir().length)
    : abs;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={2}>
        <Text color={ACCENT} bold>
          ◆ lens
        </Text>
        <Text color="gray" dimColor>
          ·
        </Text>
        <Text color="white" dimColor>
          {model}
        </Text>
        <Text color="gray" dimColor>
          ·
        </Text>
        <Text color="gray" dimColor>
          {displayPath}
        </Text>
      </Box>
      <Text color="gray" dimColor>
        {rule}
      </Text>
    </Box>
  );
}

export function InputBox({
  value,
  onChange,
  onSubmit,
  inputKey,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  inputKey?: number;
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

  const rule = "─".repeat(Math.max(1, cols));

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" dimColor>
        {rule}
      </Text>
      <Box gap={1}>
        <Text color={ACCENT}>{">"}</Text>
        <TextArea
          key={inputKey}
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="ask anything..."
        />
      </Box>
      <Text color="gray" dimColor>
        {rule}
      </Text>
    </Box>
  );
}

// ── Shortcut bar ──────────────────────────────────────────────────────────────

const SHORTCUTS = [
  ["↵", "send"],
  ["^↵", "line"],
  ["^⌫", "word"],
  ["^f", "force"],
  ["^c", "exit"],
] as const;

export function ShortcutBar({
  autoApprove,
  forceApprove,
  isThinking = false,
  model,
}: {
  autoApprove?: boolean;
  forceApprove?: boolean;
  isThinking?: boolean;
  model?: string;
}) {
  if (isThinking) {
    return (
      <Box marginTop={0} gap={1}>
        <Text color={ACCENT}>
          <Spinner type="dots" />
        </Text>
        {model && (
          <Text color="gray" dimColor>
            {model}
          </Text>
        )}
        <Text color="gray" dimColor>
          · esc cancel
        </Text>
      </Box>
    );
  }

  return (
    <Box marginTop={0} justifyContent="space-between">
      <Box>
        {forceApprove ? (
          <>
            <Text color="gray" dimColor>
              {" "}
              ·{" "}
            </Text>
            <Text color={RED} bold>
              force-all
            </Text>
          </>
        ) : autoApprove ? (
          <>
            <Text color="gray" dimColor>
              {" "}
              ·{" "}
            </Text>
            <Text color={GREEN}>auto</Text>
          </>
        ) : null}
        {model && (
          <>
            <Text color="gray" dimColor>
              {" "}
              ·{" "}
            </Text>
            <Text color="gray" dimColor>
              {model}
            </Text>
          </>
        )}
      </Box>

      <Box>
        {SHORTCUTS.map(([key, desc], i) => (
          <Box key={i}>
            {i > 0 && (
              <Text color="gray" dimColor>
                {" "}
                ·{" "}
              </Text>
            )}
            <Text color="gray">{key}</Text>
            <Text color="gray" dimColor>
              {" "}
              {desc}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ── Typewriter text ───────────────────────────────────────────────────────────

export function TypewriterText({
  text,
  color = ACCENT,
  speed = 38,
}: {
  text: string;
  color?: string;
  speed?: number;
}) {
  const [displayed, setDisplayed] = React.useState("");
  const [target, setTarget] = React.useState(text);

  React.useEffect(() => {
    setDisplayed("");
    setTarget(text);
  }, [text]);

  React.useEffect(() => {
    if (displayed.length >= target.length) return;
    const t = setTimeout(
      () => setDisplayed(target.slice(0, displayed.length + 1)),
      speed,
    );
    return () => clearTimeout(t);
  }, [displayed, target, speed]);

  return <Text color={color}>{displayed}</Text>;
}
