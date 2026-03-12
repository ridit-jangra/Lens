import React from "react";
import { Box, Text, Static } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import figures from "figures";
import { ACCENT } from "../../colors";
import { DiffViewer } from "../repo/DiffViewer";
import { StaticMessage } from "./ChatMessage";
import type { DiffLine, FilePatch } from "../repo/DiffViewer";
import type { Message, ToolCall, ChatStage } from "../../types/chat";

function History({ committed }: { committed: Message[] }) {
  return (
    <Static items={committed}>
      {(msg, i) => <StaticMessage key={i} msg={msg} />}
    </Static>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <Text color="gray" dimColor>
      {text}
    </Text>
  );
}

export function PermissionPrompt({
  tool,
  onDecide,
}: {
  tool: ToolCall;
  onDecide: (approved: boolean) => void;
}) {
  let icon: string;
  let label: string;
  let value: string;

  if (tool.type === "shell") {
    icon = "$";
    label = "run";
    value = tool.command;
  } else if (tool.type === "fetch") {
    icon = "~>";
    label = "fetch";
    value = tool.url;
  } else if (tool.type === "read-file") {
    icon = "r";
    label = "read";
    value = tool.filePath;
  } else if (tool.type === "read-folder") {
    icon = "d";
    label = "folder";
    value = tool.folderPath;
  } else if (tool.type === "grep") {
    icon = "/";
    label = "grep";
    value = `${tool.pattern}  ${tool.glob}`;
  } else if (tool.type === "delete-file") {
    icon = "x";
    label = "delete";
    value = tool.filePath;
  } else if (tool.type === "delete-folder") {
    icon = "X";
    label = "delete folder";
    value = tool.folderPath;
  } else if (tool.type === "open-url") {
    icon = "↗";
    label = "open";
    value = tool.url;
  } else if (tool.type === "generate-pdf") {
    icon = "P";
    label = "pdf";
    value = tool.filePath;
  } else if (tool.type === "write-file") {
    icon = "w";
    label = "write";
    value = `${tool.filePath} (${tool.fileContent.length} bytes)`;
  } else {
    icon = "?";
    label = "search";
    value = tool.query;
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Box gap={1}>
        <Text color={ACCENT}>{icon}</Text>
        <Text color="gray">{label}</Text>
        <Text color="white">{value}</Text>
      </Box>
      <Box gap={1} marginLeft={2}>
        <Text color="gray">y/enter allow · n/esc deny</Text>
      </Box>
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
  return (
    <Box
      marginTop={1}
      borderBottom
      borderTop
      borderRight={false}
      borderLeft={false}
      borderColor={"gray"}
      borderStyle="single"
    >
      <Box gap={1}>
        <Text color={ACCENT}>{">"}</Text>
        <TextInput
          key={inputKey}
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      </Box>
    </Box>
  );
}

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

export function ShortcutBar({ autoApprove }: { autoApprove?: boolean }) {
  return (
    <Box gap={3} marginTop={0}>
      <Text color="gray" dimColor>
        enter send · ^v paste · ^c exit
      </Text>
      <Text color={autoApprove ? "green" : "gray"} dimColor={!autoApprove}>
        {autoApprove ? "⚡ auto" : "/auto"}
      </Text>
    </Box>
  );
}

export function CloneOfferView({
  stage,
  committed,
}: {
  stage: Extract<ChatStage, { type: "clone-offer" }>;
  committed: Message[];
}) {
  return (
    <Box flexDirection="column">
      <History committed={committed} />
      <Box flexDirection="column" marginY={1}>
        <Box gap={1}>
          <Text color={ACCENT}>*</Text>
          <Text color="white">clone </Text>
          <Text color={ACCENT}>{stage.repoUrl}</Text>
          <Text color="white">?</Text>
        </Box>
        <Hint text="  y/enter clone · n/esc skip" />
      </Box>
    </Box>
  );
}

export function CloningView({
  stage,
  committed,
}: {
  stage: Extract<ChatStage, { type: "cloning" }>;
  committed: Message[];
}) {
  return (
    <Box flexDirection="column">
      <History committed={committed} />
      <Box gap={1} marginTop={1}>
        <Text color={ACCENT}>
          <Spinner />
        </Text>
        <Text color="gray">cloning </Text>
        <Text color={ACCENT}>{stage.repoUrl}</Text>
        <Text color="gray">...</Text>
      </Box>
    </Box>
  );
}

export function CloneExistsView({
  stage,
  committed,
}: {
  stage: Extract<ChatStage, { type: "clone-exists" }>;
  committed: Message[];
}) {
  return (
    <Box flexDirection="column">
      <History committed={committed} />
      <Box flexDirection="column" marginY={1}>
        <Box gap={1}>
          <Text color="yellow">!</Text>
          <Text color="gray">already cloned at </Text>
          <Text color="white">{stage.repoPath}</Text>
        </Box>
        <Hint text="  y re-clone · n use existing" />
      </Box>
    </Box>
  );
}

export function CloneDoneView({
  stage,
  committed,
}: {
  stage: Extract<ChatStage, { type: "clone-done" }>;
  committed: Message[];
}) {
  const repoName = stage.repoUrl.split("/").pop() ?? "repo";
  return (
    <Box flexDirection="column">
      <History committed={committed} />
      <Box flexDirection="column" marginY={1}>
        <Box gap={1}>
          <Text color="green">✓</Text>
          <Text color="white" bold>
            {repoName}
          </Text>
          <Text color="gray">
            cloned · {stage.fileCount} files · {stage.destPath}
          </Text>
        </Box>
        <Hint text="  enter/esc continue" />
      </Box>
    </Box>
  );
}

export function CloneErrorView({
  stage,
  committed,
}: {
  stage: Extract<ChatStage, { type: "clone-error" }>;
  committed: Message[];
}) {
  return (
    <Box flexDirection="column">
      <History committed={committed} />
      <Box flexDirection="column" marginY={1}>
        <Box gap={1}>
          <Text color="red">✗</Text>
          <Text color="red">{stage.message}</Text>
        </Box>
        <Hint text="  enter/esc continue" />
      </Box>
    </Box>
  );
}

export function PreviewView({
  stage,
  committed,
}: {
  stage: Extract<ChatStage, { type: "preview" }>;
  committed: Message[];
}) {
  const { patches, diffLines, scrollOffset } = stage;
  return (
    <Box flexDirection="column">
      <History committed={committed} />
      <Box gap={1} marginTop={1}>
        <Text color={ACCENT}>*</Text>
        <Text color="white" bold>
          proposed changes
        </Text>
        <Text color="gray">
          ({patches.length} file{patches.length !== 1 ? "s" : ""})
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        {patches.map((p) => (
          <Box key={p.path} gap={1}>
            <Text color={p.isNew ? "green" : "yellow"}>
              {p.isNew ? "+" : "~"}
            </Text>
            <Text color={p.isNew ? "green" : "yellow"}>{p.path}</Text>
            {p.isNew && (
              <Text color="gray" dimColor>
                new
              </Text>
            )}
          </Box>
        ))}
      </Box>
      <DiffViewer
        patches={patches}
        diffs={diffLines}
        scrollOffset={scrollOffset}
      />
      <Hint text="↑↓ scroll · enter/a apply · s/esc skip" />
    </Box>
  );
}

export function ViewingFileView({
  stage,
  committed,
}: {
  stage: Extract<ChatStage, { type: "viewing-file" }>;
  committed: Message[];
}) {
  const { file, diffLines, scrollOffset } = stage;
  return (
    <Box flexDirection="column">
      <History committed={committed} />
      <Box gap={1} marginTop={1}>
        <Text color={ACCENT}>r</Text>
        <Text color="white" bold>
          {file.path}
        </Text>
        <Text color="gray" dimColor>
          {file.isNew ? "new" : "modified"}
        </Text>
      </Box>
      <DiffViewer
        patches={[file.patch]}
        diffs={[diffLines]}
        scrollOffset={scrollOffset}
      />
      <Hint text="↑↓ scroll · enter/esc back" />
    </Box>
  );
}
