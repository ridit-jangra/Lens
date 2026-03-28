import React, { useState, useEffect } from "react";
import { Box, Text, useStdout } from "ink";
import { TextArea } from "./TextArea";
import { ACCENT, GREEN, RED } from "../../colors";

// ── Full-width rule input box (old style) ─────────────────────────────────────

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

export function ShortcutBar({
  autoApprove,
  forceApprove,
}: {
  autoApprove?: boolean;
  forceApprove?: boolean;
}) {
  return (
    <Box gap={3} marginTop={0}>
      <Text color="gray" dimColor>
        enter send · ctrl+enter newline · ctrl+del del word · ^f force · ^c exit
      </Text>
      {forceApprove ? (
        <Text color={RED}>⚡⚡ force-all</Text>
      ) : (
        <Text color={autoApprove ? GREEN : "gray"} dimColor={!autoApprove}>
          {autoApprove ? "⚡ auto" : "/auto"}
        </Text>
      )}
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
