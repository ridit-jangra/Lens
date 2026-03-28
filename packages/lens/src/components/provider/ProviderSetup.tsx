import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import {
  addProvider,
  setActiveProvider,
  removeProvider,
  getConfiguredProviders,
  loadConfig,
  type Provider,
} from "@ridit/lens-core";
import { ProviderTypeStep } from "./ProviderTypeStep";
import { ApiKeyStep } from "./ApiKeyStep";
import { ModelStep } from "./ModelStep";
import { ACCENT, GREEN, RED } from "../../colors";

type Stage =
  | { type: "menu" }
  | { type: "provider-type" }
  | { type: "credentials"; provider: Provider }
  | { type: "model"; provider: Provider; apiKey: string; baseURL?: string }
  | { type: "remove-pick" }
  | { type: "remove-confirm"; provider: Provider }
  | { type: "switch-pick" }
  | { type: "done"; message: string };

type MenuAction = "provider-type" | "remove-pick" | "switch-pick";

const MENU_OPTIONS: { label: string; action: MenuAction }[] = [
  { label: "Add / update a provider", action: "provider-type" },
  { label: "Remove a provider", action: "remove-pick" },
  { label: "Switch active provider", action: "switch-pick" },
];

function CompletedStep({ label }: { label: string }) {
  return (
    <Text color={GREEN}>
      {figures.tick} {label}
    </Text>
  );
}

function Menu({
  completedSteps,
  onSelect,
}: {
  completedSteps: string[];
  onSelect: (action: MenuAction) => void;
}) {
  const config = loadConfig();
  const configured = getConfiguredProviders();
  const [index, setIndex] = useState(0);

  useInput((_, key) => {
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(MENU_OPTIONS.length - 1, i + 1));
    if (key.return) onSelect(MENU_OPTIONS[index]!.action);
  });

  return (
    <Box flexDirection="column" gap={1}>
      {completedSteps.map((s, i) => <CompletedStep key={i} label={s} />)}
      <Text bold color={ACCENT}>Lens — provider setup</Text>
      {configured.length > 0 && (
        <Text color="gray" dimColor>
          {figures.info} active: <Text color="white">{config.activeProvider}</Text>
          {"  "}({configured.length} configured)
        </Text>
      )}
      {MENU_OPTIONS.map((opt, i) => (
        <Box key={opt.action} marginLeft={1}>
          <Text color={i === index ? ACCENT : "white"}>
            {i === index ? figures.arrowRight : " "}{"  "}
            <Text bold={i === index}>{opt.label}</Text>
          </Text>
        </Box>
      ))}
      <Text color="gray" dimColor>↑↓ navigate · enter to select</Text>
    </Box>
  );
}

function RemovePick({
  completedSteps,
  onSelect,
  onBack,
}: {
  completedSteps: string[];
  onSelect: (provider: Provider) => void;
  onBack: () => void;
}) {
  const configured = getConfiguredProviders();
  const [index, setIndex] = useState(0);

  useInput((_, key) => {
    if (key.escape) { onBack(); return; }
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(configured.length - 1, i + 1));
    if (key.return && configured.length > 0) onSelect(configured[index]!);
  });

  if (configured.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        {completedSteps.map((s, i) => <CompletedStep key={i} label={s} />)}
        <Text color="gray">{figures.info} No providers configured.</Text>
        <Text color="gray" dimColor>esc to go back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {completedSteps.map((s, i) => <CompletedStep key={i} label={s} />)}
      <Text bold color={ACCENT}>Remove a provider</Text>
      {configured.map((p, i) => (
        <Box key={p} marginLeft={1}>
          <Text color={i === index ? RED : "white"}>
            {i === index ? figures.arrowRight : " "}{"  "}
            <Text bold={i === index}>{p}</Text>
          </Text>
        </Box>
      ))}
      <Text color="gray" dimColor>↑↓ navigate · enter to select · esc to cancel</Text>
    </Box>
  );
}

function RemoveConfirm({
  provider,
  completedSteps,
  onConfirm,
  onBack,
}: {
  provider: Provider;
  completedSteps: string[];
  onConfirm: () => void;
  onBack: () => void;
}) {
  useInput((input, key) => {
    if (input === "y" || input === "Y") onConfirm();
    else if (key.escape || input === "n" || input === "N") onBack();
  });

  return (
    <Box flexDirection="column" gap={1}>
      {completedSteps.map((s, i) => <CompletedStep key={i} label={s} />)}
      <Text color={RED}>
        {figures.warning} Remove <Text bold>{provider}</Text>? (y/n)
      </Text>
    </Box>
  );
}

function SwitchPick({
  completedSteps,
  onSelect,
  onBack,
}: {
  completedSteps: string[];
  onSelect: (provider: Provider) => void;
  onBack: () => void;
}) {
  const config = loadConfig();
  const configured = getConfiguredProviders();
  const [index, setIndex] = useState(0);

  useInput((_, key) => {
    if (key.escape) { onBack(); return; }
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(configured.length - 1, i + 1));
    if (key.return && configured.length > 0) onSelect(configured[index]!);
  });

  if (configured.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        {completedSteps.map((s, i) => <CompletedStep key={i} label={s} />)}
        <Text color="gray">{figures.info} No providers configured.</Text>
        <Text color="gray" dimColor>esc to go back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {completedSteps.map((s, i) => <CompletedStep key={i} label={s} />)}
      <Text bold color={ACCENT}>Switch active provider</Text>
      {configured.map((p, i) => {
        const isActive = p === config.activeProvider;
        const isSelected = i === index;
        return (
          <Box key={p} marginLeft={1}>
            <Text color={isSelected ? ACCENT : "white"}>
              {isSelected ? figures.arrowRight : " "}{"  "}
              <Text bold={isSelected}>{p}</Text>
              {isActive && <Text color="gray">{"  "}active</Text>}
            </Text>
          </Box>
        );
      })}
      <Text color="gray" dimColor>↑↓ navigate · enter to select · esc to cancel</Text>
    </Box>
  );
}

function DoneScreen({ message, onDone }: { message: string; onDone: () => void }) {
  useInput((_: string, key: { return: boolean; escape: boolean }) => {
    if (key.return || key.escape) onDone();
  });
  return (
    <Box flexDirection="column" gap={1}>
      <Text color={GREEN}>{figures.tick} {message}</Text>
      <Text color="gray" dimColor>press enter to continue</Text>
    </Box>
  );
}

export function ProviderSetup({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<Stage>({ type: "menu" });
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  const pushStep = (label: string) => setCompletedSteps((s) => [...s, label]);
  const goMenu = () => setStage({ type: "menu" });

  if (stage.type === "menu") {
    return (
      <Menu
        completedSteps={completedSteps}
        onSelect={(action) => setStage({ type: action } as Stage)}
      />
    );
  }

  if (stage.type === "provider-type") {
    return (
      <Box flexDirection="column" gap={1}>
        {completedSteps.map((s, i) => <CompletedStep key={i} label={s} />)}
        <ProviderTypeStep
          onSelect={(provider) => {
            pushStep(`Provider: ${provider}`);
            setStage({ type: "credentials", provider });
          }}
        />
      </Box>
    );
  }

  if (stage.type === "credentials") {
    return (
      <Box flexDirection="column" gap={1}>
        {completedSteps.map((s, i) => <CompletedStep key={i} label={s} />)}
        <ApiKeyStep
          providerType={stage.provider}
          onSubmit={(apiKey, baseURL) => {
            if (stage.provider === "ollama") {
              pushStep(`Base URL: ${baseURL ?? "http://localhost:11434"}`);
            } else {
              pushStep("API key saved");
              if (baseURL) pushStep(`Base URL: ${baseURL}`);
            }
            setStage({ type: "model", provider: stage.provider, apiKey, baseURL });
          }}
        />
      </Box>
    );
  }

  if (stage.type === "model") {
    return (
      <Box flexDirection="column" gap={1}>
        {completedSteps.map((s, i) => <CompletedStep key={i} label={s} />)}
        <ModelStep
          providerType={stage.provider}
          onSelect={(model) => {
            addProvider(stage.provider, {
              apiKey: stage.apiKey,
              model,
              baseURL: stage.baseURL,
            });
            setActiveProvider(stage.provider);
            pushStep(`Model: ${model}`);
            setStage({ type: "done", message: `Provider set to ${stage.provider} (${model})` });
          }}
        />
      </Box>
    );
  }

  if (stage.type === "remove-pick") {
    return (
      <RemovePick
        completedSteps={completedSteps}
        onSelect={(provider) => setStage({ type: "remove-confirm", provider })}
        onBack={goMenu}
      />
    );
  }

  if (stage.type === "remove-confirm") {
    return (
      <RemoveConfirm
        provider={stage.provider}
        completedSteps={completedSteps}
        onConfirm={() => {
          removeProvider(stage.provider);
          pushStep(`Removed: ${stage.provider}`);
          setStage({ type: "done", message: `Provider ${stage.provider} removed` });
        }}
        onBack={goMenu}
      />
    );
  }

  if (stage.type === "switch-pick") {
    return (
      <SwitchPick
        completedSteps={completedSteps}
        onSelect={(provider) => {
          setActiveProvider(provider);
          pushStep(`Switched to: ${provider}`);
          setStage({ type: "done", message: `Now using ${provider}` });
        }}
        onBack={goMenu}
      />
    );
  }

  // done
  return <DoneScreen message={stage.message} onDone={onDone} />;
}
