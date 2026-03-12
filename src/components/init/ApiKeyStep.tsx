import { Box, Text, useInput, type Key } from "ink";
import { useState } from "react";
import { execSync } from "child_process";
import type { ProviderType } from "../../types/config";

const LABELS: Record<ProviderType, string> = {
  anthropic: "Anthropic API key",
  gemini: "Gemini API key",
  openai: "OpenAI API key",
  ollama: "Ollama base URL (default: http://localhost:11434)",
  custom: "API key",
};

function readClipboard(): string | null {
  try {
    if (process.platform === "win32") {
      return execSync("powershell -command Get-Clipboard", {
        encoding: "utf-8",
      }).trim();
    } else if (process.platform === "darwin") {
      return execSync("pbpaste", { encoding: "utf-8" }).trim();
    } else {
      try {
        return execSync("xclip -selection clipboard -o", {
          encoding: "utf-8",
        }).trim();
      } catch {
        return execSync("xsel --clipboard --output", {
          encoding: "utf-8",
        }).trim();
      }
    }
  } catch {
    return null;
  }
}

type CustomResult = { apiKey: string; baseUrl?: string };
type Field = "apiKey" | "baseUrl";

const useFieldInput = (initial: string, onPasteError: (v: boolean) => void) => {
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
      } else onPasteError(true);
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
};

const SimpleInput = ({
  providerType,
  onSubmit,
  onSkip,
}: {
  providerType: Exclude<ProviderType, "custom">;
  onSubmit: (value: string) => void;
  onSkip?: () => void;
}) => {
  const [pasteError, setPasteError] = useState(false);
  const isPassword = providerType !== "ollama";
  const { value, handle } = useFieldInput(
    providerType === "ollama" ? "http://localhost:11434" : "",
    setPasteError,
  );

  useInput((input, key) => {
    if (key.return) {
      if (value.trim()) onSubmit(value.trim());
      return;
    }
    if (key.escape && onSkip) {
      onSkip();
      return;
    }
    handle(input, key);
  });

  const display = isPassword ? "•".repeat(value.length) : value;

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="cyan">
        {LABELS[providerType]}
      </Text>
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text>{display || " "}</Text>
      </Box>
      {pasteError ? (
        <Text color="red">⚠ Could not read clipboard</Text>
      ) : (
        <Text color="gray">
          enter to confirm · ctrl+v to paste · ctrl+a to clear
          {onSkip ? " · esc to skip" : ""}
        </Text>
      )}
    </Box>
  );
};

const CustomInput = ({
  onSubmit,
  onSkip,
}: {
  onSubmit: (result: CustomResult) => void;
  onSkip?: () => void;
}) => {
  const [activeField, setActiveField] = useState<Field>("apiKey");
  const [pasteError, setPasteError] = useState(false);

  const apiKeyField = useFieldInput("", setPasteError);
  const baseUrlField = useFieldInput("", setPasteError);

  const active = activeField === "apiKey" ? apiKeyField : baseUrlField;

  useInput((input, key) => {
    if (key.escape && onSkip) {
      onSkip();
      return;
    }

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
      if (activeField === "baseUrl" && apiKeyField.value.trim()) {
        onSubmit({
          apiKey: apiKeyField.value.trim(),
          baseUrl: baseUrlField.value.trim() || undefined,
        });
        return;
      }
    }

    active.handle(input, key);
  });

  const fields: {
    id: Field;
    label: string;
    password: boolean;
    placeholder: string;
  }[] = [
    { id: "apiKey", label: "API key", password: true, placeholder: "sk-..." },
    {
      id: "baseUrl",
      label: "Base URL",
      password: false,
      placeholder: "https://api.example.com/v1",
    },
  ];

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="cyan">
        Custom provider
      </Text>

      {fields.map(({ id, label, password, placeholder }) => {
        const isActive = activeField === id;
        const val = id === "apiKey" ? apiKeyField.value : baseUrlField.value;
        const display = password ? "•".repeat(val.length) : val;

        return (
          <Box key={id} flexDirection="column" gap={0}>
            <Text color={isActive ? "cyan" : "gray"}>
              {isActive ? "›" : " "} {label}
              {id === "baseUrl" ? " (optional)" : ""}
            </Text>
            <Box
              borderStyle="round"
              borderColor={isActive ? "cyan" : "gray"}
              paddingX={1}
            >
              <Text color={val ? "white" : "gray"}>
                {display || placeholder}
              </Text>
            </Box>
          </Box>
        );
      })}

      {pasteError ? (
        <Text color="red">⚠ Could not read clipboard</Text>
      ) : (
        <Text color="gray">
          enter to next field · tab to switch · ctrl+v to paste · ctrl+a to
          clear
          {onSkip ? " · esc to skip" : ""}
        </Text>
      )}
    </Box>
  );
};

export const ApiKeyStep = ({
  providerType,
  onSubmit,
  onSkip,
}: {
  providerType: ProviderType;
  onSubmit: (value: string | CustomResult) => void;
  onSkip?: () => void;
}) => {
  if (providerType === "custom") {
    return <CustomInput onSubmit={onSubmit} onSkip={onSkip} />;
  }

  return (
    <SimpleInput
      providerType={providerType}
      onSubmit={onSubmit}
      onSkip={onSkip}
    />
  );
};
