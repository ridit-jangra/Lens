import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";
import { execSync } from "child_process";
import type { ProviderType } from "../../types/config";
import { ACCENT, TEXT } from "../../colors";

const LABELS: Record<ProviderType, string> = {
  anthropic: "Anthropic API key",
  gemini: "Gemini API key",
  openai: "OpenAI API key",
  ollama: "Ollama base URL",
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

const SimpleInput = ({
  providerType,
  onSubmit,
  onBack,
}: {
  providerType: Exclude<ProviderType, "custom">;
  onSubmit: (value: string) => void;
  onBack?: () => void;
}) => {
  const isPassword = providerType !== "ollama";
  const [value, setValue] = useState(
    providerType === "ollama" ? "http://localhost:11434" : "",
  );

  useInput((input, key) => {
    if (key.escape) {
      onBack?.();
      return;
    }
    if (key.ctrl && input === "v") {
      const clip = readClipboard();
      if (clip) setValue((v) => v + clip);
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text color={TEXT}>{LABELS[providerType]}</Text>
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(v) => {
            if (v.trim()) onSubmit(v.trim());
          }}
          mask={isPassword ? "*" : undefined}
          placeholder={
            providerType === "ollama" ? "http://localhost:11434" : ""
          }
        />
      </Box>
      <Text color="gray">
        enter to confirm · ctrl+v to paste{onBack ? " · esc back" : ""}
      </Text>
    </Box>
  );
};

const CustomInput = ({
  onSubmit,
  onBack,
}: {
  onSubmit: (result: CustomResult) => void;
  onBack?: () => void;
}) => {
  const [activeField, setActiveField] = useState<Field>("apiKey");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  useInput((input, key) => {
    if (key.escape) {
      onBack?.();
      return;
    }
    if (key.tab) {
      setActiveField((f) => (f === "apiKey" ? "baseUrl" : "apiKey"));
      return;
    }
    if (key.ctrl && input === "v") {
      const clip = readClipboard();
      if (clip) {
        if (activeField === "apiKey") setApiKey((v) => v + clip);
        else setBaseUrl((v) => v + clip);
      }
    }
  });

  const fields: { id: Field; label: string; placeholder: string }[] = [
    { id: "apiKey", label: "API key", placeholder: "sk-..." },
    {
      id: "baseUrl",
      label: "Base URL (optional)",
      placeholder: "https://api.example.com/v1",
    },
  ];

  return (
    <Box flexDirection="column" gap={1}>
      {fields.map(({ id, label, placeholder }) => {
        const isActive = activeField === id;
        const val = id === "apiKey" ? apiKey : baseUrl;
        return (
          <Box key={id} flexDirection="column" gap={0}>
            <Text color={isActive ? ACCENT : "gray"}>
              {isActive ? "›" : " "} {label}
            </Text>
            <Box
              borderStyle="round"
              borderColor={isActive ? ACCENT : "gray"}
              paddingX={1}
            >
              {isActive ? (
                <TextInput
                  value={val}
                  onChange={id === "apiKey" ? setApiKey : setBaseUrl}
                  onSubmit={() => {
                    if (id === "apiKey" && apiKey.trim()) {
                      setActiveField("baseUrl");
                    } else if (id === "baseUrl" && apiKey.trim()) {
                      onSubmit({
                        apiKey: apiKey.trim(),
                        baseUrl: baseUrl.trim() || undefined,
                      });
                    }
                  }}
                  mask={id === "apiKey" ? "*" : undefined}
                  placeholder={placeholder}
                />
              ) : (
                <Text color={val ? "white" : "gray"}>
                  {id === "apiKey" && val
                    ? "*".repeat(val.length)
                    : val || placeholder}
                </Text>
              )}
            </Box>
          </Box>
        );
      })}
      <Text color="gray">
        enter to next · tab to switch · ctrl+v to paste
        {onBack ? " · esc back" : ""}
      </Text>
    </Box>
  );
};

export const ApiKeyStep = ({
  providerType,
  onSubmit,
  onBack,
}: {
  providerType: ProviderType;
  onSubmit: (value: string | CustomResult) => void;
  onBack?: () => void;
}) => {
  if (providerType === "custom") {
    return <CustomInput onSubmit={onSubmit} onBack={onBack} />;
  }
  return (
    <SimpleInput
      providerType={providerType}
      onSubmit={onSubmit}
      onBack={onBack}
    />
  );
};
