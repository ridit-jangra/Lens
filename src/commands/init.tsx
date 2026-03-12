import { Box, Text, useInput } from "ink";
import figures from "figures";
import { useState } from "react";
import { nanoid } from "nanoid";
import { addProvider, loadConfig } from "../utils/config";
import { ProviderTypeStep } from "../components/init/ProviderTypeStep";
import { ApiKeyStep } from "../components/init/ApiKeyStep";
import { ModelStep } from "../components/init/ModelStep";
import { RemoveProviderStep } from "../components/init/RemoveProviderStep";
import type { Provider, ProviderType } from "../types/config";

type InitStage =
  | { type: "menu" }
  | { type: "provider-type" }
  | { type: "api-key"; providerType: ProviderType }
  | { type: "base-url"; providerType: ProviderType; apiKey: string }
  | {
      type: "model";
      providerType: ProviderType;
      apiKey: string;
      baseUrl?: string;
    }
  | { type: "remove" }
  | { type: "done"; provider: Provider };

const MENU_OPTIONS = [
  { label: "Add a provider", action: "provider-type" },
  { label: "Remove a provider", action: "remove" },
] as const;

export const InitCommand = () => {
  const [stage, setStage] = useState<InitStage>({ type: "menu" });
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [menuIndex, setMenuIndex] = useState(0);

  const pushStep = (label: string) => setCompletedSteps((s) => [...s, label]);

  useInput((input, key) => {
    if (stage.type !== "menu") return;
    if (key.upArrow) setMenuIndex((i) => Math.max(0, i - 1));
    if (key.downArrow)
      setMenuIndex((i) => Math.min(MENU_OPTIONS.length - 1, i + 1));
    if (key.return) {
      const action = MENU_OPTIONS[menuIndex]?.action;
      if (action === "provider-type") setStage({ type: "provider-type" });
      if (action === "remove") setStage({ type: "remove" });
    }
  });

  if (stage.type === "menu") {
    const config = loadConfig();
    return (
      <Box flexDirection="column" gap={1}>
        {completedSteps.map((s, i) => (
          <Text key={i} color="green">
            {figures.tick} {s}
          </Text>
        ))}
        <Text bold color="cyan">
          Lens — provider setup
        </Text>
        {config.providers.length > 0 && (
          <Text color="gray">
            {figures.info} {config.providers.length} provider(s) configured
          </Text>
        )}
        {MENU_OPTIONS.map((opt, i) => (
          <Box key={opt.action} marginLeft={1}>
            <Text color={i === menuIndex ? "cyan" : "white"}>
              {i === menuIndex ? figures.arrowRight : " "}
              {"  "}
              {opt.label}
            </Text>
          </Box>
        ))}
        <Text color="gray">↑↓ navigate · enter to select</Text>
      </Box>
    );
  }

  if (stage.type === "remove") {
    return (
      <Box flexDirection="column" gap={1}>
        {completedSteps.map((s, i) => (
          <Text key={i} color="green">
            {figures.tick} {s}
          </Text>
        ))}
        <RemoveProviderStep onDone={() => setStage({ type: "menu" })} />
      </Box>
    );
  }

  if (stage.type === "provider-type") {
    return (
      <Box flexDirection="column" gap={1}>
        {completedSteps.map((s, i) => (
          <Text key={i} color="green">
            {figures.tick} {s}
          </Text>
        ))}
        <ProviderTypeStep
          onSelect={(providerType) => {
            pushStep(`Provider: ${providerType}`);
            setStage({ type: "api-key", providerType });
          }}
        />
      </Box>
    );
  }

  if (stage.type === "api-key") {
    return (
      <Box flexDirection="column" gap={1}>
        {completedSteps.map((s, i) => (
          <Text key={i} color="green">
            {figures.tick} {s}
          </Text>
        ))}
        <ApiKeyStep
          providerType={stage.providerType}
          onSubmit={(value) => {
            if (stage.providerType === "custom") {
              const { apiKey, baseUrl } = value as {
                apiKey: string;
                baseUrl?: string;
              };
              pushStep("API key saved");
              if (baseUrl) pushStep(`Base URL: ${baseUrl}`);
              setStage({
                type: "model",
                providerType: stage.providerType,
                apiKey,
                baseUrl,
              });
            } else if (stage.providerType === "ollama") {
              pushStep(`Base URL: ${value}`);
              setStage({
                type: "model",
                providerType: stage.providerType,
                apiKey: "",
                baseUrl: value as string,
              });
            } else {
              pushStep("API key saved");
              setStage({
                type: "model",
                providerType: stage.providerType,
                apiKey: value as string,
              });
            }
          }}
        />
      </Box>
    );
  }

  if (stage.type === "base-url") {
    return (
      <Box flexDirection="column" gap={1}>
        {completedSteps.map((s, i) => (
          <Text key={i} color="green">
            {figures.tick} {s}
          </Text>
        ))}
        <ApiKeyStep
          providerType="ollama"
          onSubmit={(baseUrl) => {
            pushStep(`Base URL: ${baseUrl}`);
            setStage({
              type: "model",
              providerType: stage.providerType,
              apiKey: stage.apiKey,
              baseUrl: baseUrl as string,
            });
          }}
        />
      </Box>
    );
  }

  if (stage.type === "model") {
    return (
      <Box flexDirection="column" gap={1}>
        {completedSteps.map((s, i) => (
          <Text key={i} color="green">
            {figures.tick} {s}
          </Text>
        ))}
        <ModelStep
          providerType={stage.providerType}
          onSelect={(model) => {
            const provider: Provider = {
              id: nanoid(8),
              type: stage.providerType,
              name: `${stage.providerType}-${model}`,
              apiKey: stage.apiKey || undefined,
              baseUrl: stage.baseUrl,
              model,
            };
            addProvider(provider);
            pushStep(`Model: ${model}`);
            setStage({ type: "done", provider });
          }}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {completedSteps.map((s, i) => (
        <Text key={i} color="green">
          {figures.tick} {s}
        </Text>
      ))}
      <Text color="green">{figures.tick} Provider configured successfully</Text>
      <Text color="gray">
        {figures.info} Run <Text color="cyan">lens init</Text> again to manage
        providers.
      </Text>
    </Box>
  );
};
