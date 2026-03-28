import React, { useState } from "react";
import { Box, Text, useInput, type Key } from "ink";
import { execSync } from "child_process";
import type { Provider } from "@ridit/lens-core";
import { ACCENT } from "../../colors";

function readClipboard(): string | null {
  try {
    if (process.platform === "win32") {
      return execSync("powershell -command Get-Clipboard", { encoding: "utf-8" }).trim();
    } else if (process.platform === "darwin") {
      return execSync("pbpaste", { encoding: "utf-8" }).trim();
    } else {
      try {
        return execSync("xclip -selection clipboard -o", { encoding: "utf-8" }).trim();
      } catch {
        return execSync("xsel --clipboard --output", { encoding: "utf-8" }).trim();
      }
    }
  } catch {
    return null;
  }
}

const LABELS: Partial<Record<Provider, string>> = {
  anthropic: "Anthropic API key",
  openai: "OpenAI API key",
  google: "Google API key",
  groq: "Groq API key",
  openrouter: "OpenRouter API key",
  ollama: "Ollama base URL (leave blank for http://localhost:11434)",
};

function useFieldInput(initial: string, onPasteError: (v: boolean) => void) {
  const [value, setValue] = useState(initial);

  const handle = (input: string, key: Key) => {
    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      onPasteError(false);
      return;
    }
    if (key.ctrl && input === "v") {
      const clip = readClipboard();
      if (clip) {
        setValue((v) => v + clip);
        onPasteError(false);
      } else {
        onPasteError(true);
      }
      return;
    }
    if (key.ctrl && input === "a") {
      setValue("");
      return;
    }
    if (!key.ctrl && !key.meta && input) {
      setValue((v) => v + input);
      onPasteError(false);
    }
  };

  return { value, setValue, handle };
}

// Single-field input (API key or base URL)
function SimpleInput({
  providerType,
  onSubmit,
}: {
  providerType: Exclude<Provider, "custom">;
  onSubmit: (value: string) => void;
}) {
  const [pasteError, setPasteError] = useState(false);
  const isOllama = providerType === "ollama";
  const { value, handle } = useFieldInput(
    isOllama ? "http://localhost:11434" : "",
    setPasteError,
  );

  useInput((input, key) => {
    if (key.return) {
      onSubmit(value.trim());
      return;
    }
    handle(input, key);
  });

  const display = isOllama ? value : "•".repeat(value.length);

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={ACCENT}>
        {LABELS[providerType] ?? "API key"}
      </Text>
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text>{display || " "}</Text>
      </Box>
      {pasteError ? (
        <Text color="red">⚠ Could not read clipboard</Text>
      ) : (
        <Text color="gray" dimColor>
          enter to confirm · ctrl+v to paste · ctrl+a to clear
        </Text>
      )}
    </Box>
  );
}

// Two-field input for custom provider (API key + base URL)
function CustomInput({
  onSubmit,
}: {
  onSubmit: (apiKey: string, baseURL?: string) => void;
}) {
  type Field = "apiKey" | "baseUrl";
  const [activeField, setActiveField] = useState<Field>("apiKey");
  const [pasteError, setPasteError] = useState(false);

  const apiKeyField = useFieldInput("", setPasteError);
  const baseUrlField = useFieldInput("", setPasteError);
  const active = activeField === "apiKey" ? apiKeyField : baseUrlField;

  useInput((input, key) => {
    if (key.tab) {
      setActiveField((f) => (f === "apiKey" ? "baseUrl" : "apiKey"));
      setPasteError(false);
      return;
    }
    if (key.return) {
      if (activeField === "apiKey" && apiKeyField.value.trim()) {
        setActiveField("baseUrl");
        return;
      }
      if (activeField === "baseUrl") {
        onSubmit(
          apiKeyField.value.trim(),
          baseUrlField.value.trim() || undefined,
        );
        return;
      }
    }
    active.handle(input, key);
  });

  const fields: { id: Field; label: string; password: boolean; placeholder: string }[] = [
    { id: "apiKey", label: "API key", password: true, placeholder: "sk-..." },
    { id: "baseUrl", label: "Base URL", password: false, placeholder: "https://api.example.com/v1" },
  ];

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color={ACCENT}>
        Custom provider
      </Text>
      {fields.map(({ id, label, password, placeholder }) => {
        const isActive = activeField === id;
        const val = id === "apiKey" ? apiKeyField.value : baseUrlField.value;
        const display = password ? "•".repeat(val.length) : val;
        return (
          <Box key={id} flexDirection="column">
            <Text color={isActive ? ACCENT : "gray"}>
              {isActive ? "›" : " "} {label}
              {id === "baseUrl" ? " (optional)" : ""}
            </Text>
            <Box borderStyle="round" borderColor={isActive ? ACCENT : "gray"} paddingX={1}>
              <Text color={val ? "white" : "gray"}>{display || placeholder}</Text>
            </Box>
          </Box>
        );
      })}
      {pasteError ? (
        <Text color="red">⚠ Could not read clipboard</Text>
      ) : (
        <Text color="gray" dimColor>
          enter to next · tab to switch · ctrl+v to paste · ctrl+a to clear
        </Text>
      )}
    </Box>
  );
}

export function ApiKeyStep({
  providerType,
  onSubmit,
}: {
  providerType: Provider;
  onSubmit: (apiKey: string, baseURL?: string) => void;
}) {
  if (providerType === "custom") {
    return <CustomInput onSubmit={onSubmit} />;
  }
  if (providerType === "ollama") {
    return (
      <SimpleInput
        providerType="ollama"
        onSubmit={(baseUrl) => onSubmit("ollama", baseUrl || "http://localhost:11434")}
      />
    );
  }
  return (
    <SimpleInput
      providerType={providerType}
      onSubmit={(apiKey) => onSubmit(apiKey)}
    />
  );
}
