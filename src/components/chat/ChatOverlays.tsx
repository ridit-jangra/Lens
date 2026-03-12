import React from "react";
import { Box, Text, Static } from "ink";
import Spinner from "ink-spinner";
import figures from "figures";
import { ORANGE } from "../../colors";
import { DiffViewer } from "../repo/DiffViewer";
import { StaticMessage } from "./ChatMessage";
import type { DiffLine, FilePatch } from "../repo/DiffViewer";
import type { Message, ToolCall, ChatStage } from "../../types/chat";

function Key({ k }: { k: string }) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={0}>
      <Text color="white">{k}</Text>
    </Box>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <Box gap={1} alignItems="center">
      {keys.map((k, i) => (
        <Key key={i} k={k} />
      ))}
      <Text color="gray" dimColor>
        {label}
      </Text>
    </Box>
  );
}

export function PermissionPrompt({
  tool,
  onDecide,
}: {
  tool: ToolCall;
  onDecide: (approved: boolean) => void;
}) {
  const isShell = tool.type === "shell";
  const isFetch = tool.type === "fetch";
  const isReadFile = tool.type === "read-file";
  const isWriteFile = tool.type === "write-file";

  let icon = figures.warning;
  let label = "Unknown tool";
  let value = "";
  let valueColor: "red" | "cyan" | "blue" | "green" = "cyan";

  if (isShell) {
    icon = "$";
    label = "Run command";
    value = (tool as { type: "shell"; command: string }).command;
    valueColor = "red";
  } else if (isFetch) {
    icon = "↗";
    label = "Fetch URL";
    value = (tool as { type: "fetch"; url: string }).url;
    valueColor = "cyan";
  } else if (isReadFile) {
    icon = "📄";
    label = "Read file";
    value = (tool as { type: "read-file"; filePath: string }).filePath;
    valueColor = "blue";
  } else if (isWriteFile) {
    const wf = tool as {
      type: "write-file";
      filePath: string;
      fileContent: string;
    };
    icon = "✎";
    label = "Write file";
    value = `${wf.filePath} (${wf.fileContent.length} bytes)`;
    valueColor = "green";
  }

  return (
    <Box
      flexDirection="column"
      gap={1}
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      marginY={1}
    >
      <Box gap={1}>
        <Text bold color="yellow">
          {icon}
        </Text>
        <Text bold color="yellow">
          {label}
        </Text>
      </Box>
      <Text color={valueColor}>{value}</Text>
      <Box gap={3}>
        <Shortcut keys={["Y", "↵"]} label="allow" />
        <Shortcut keys={["N", "Esc"]} label="deny" />
      </Box>
    </Box>
  );
}

export function InputBox({ value }: { value: string }) {
  return (
    <Box gap={1} borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color="green" bold>
        {figures.triangleRight}
      </Text>
      <Text color="white">{value}</Text>
      <Text color="green">▋</Text>
    </Box>
  );
}

export function ShortcutBar() {
  return (
    <Box gap={3} marginTop={0}>
      <Shortcut keys={["↵"]} label="send" />
      <Shortcut keys={["^V"]} label="paste" />
      <Shortcut keys={["^C"]} label="exit" />
      <Shortcut keys={["⌫"]} label="delete" />
    </Box>
  );
}

function History({ committed }: { committed: Message[] }) {
  return (
    <Static items={committed}>
      {(msg, i) => <StaticMessage key={i} msg={msg} />}
    </Static>
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
    <Box flexDirection="column" gap={1}>
      <History committed={committed} />
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        gap={0}
      >
        <Text bold color="cyan">
          {figures.info} Want to go deeper?
        </Text>
        <Text color="white">
          Clone{" "}
          <Text color="cyan" bold>
            {stage.repoUrl}
          </Text>{" "}
          and analyze it?
        </Text>
        <Box gap={3} marginTop={1}>
          <Shortcut keys={["Y", "↵"]} label="clone" />
          <Shortcut keys={["N", "Esc"]} label="skip" />
        </Box>
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
    <Box flexDirection="column" gap={1}>
      <History committed={committed} />
      <Box gap={1}>
        <Text color={ORANGE}>
          <Spinner />
        </Text>
        <Text>
          Cloning{" "}
          <Text color="cyan" bold>
            {stage.repoUrl}
          </Text>
          …
        </Text>
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
    <Box flexDirection="column" gap={1}>
      <History committed={committed} />
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        gap={0}
      >
        <Text bold color="yellow">
          {figures.warning} Already cloned
        </Text>
        <Text color="white">{stage.repoPath}</Text>
        <Box gap={3} marginTop={1}>
          <Shortcut keys={["Y"]} label="re-clone" />
          <Shortcut keys={["N"]} label="use existing" />
        </Box>
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
    <Box flexDirection="column" gap={1}>
      <History committed={committed} />
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="green"
        paddingX={1}
        gap={0}
      >
        <Text bold color="green">
          {figures.tick} Cloned successfully
        </Text>
        <Box gap={2}>
          <Text color="gray">repo </Text>
          <Text color="white" bold>
            {repoName}
          </Text>
        </Box>
        <Box gap={2}>
          <Text color="gray">path </Text>
          <Text color="white">{stage.destPath}</Text>
        </Box>
        <Box gap={2}>
          <Text color="gray">files</Text>
          <Text color="white">{stage.fileCount} files indexed</Text>
        </Box>
      </Box>
      <Box gap={3}>
        <Shortcut keys={["↵", "Esc"]} label="continue" />
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
    <Box flexDirection="column" gap={1}>
      <History committed={committed} />
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="red"
        paddingX={1}
        gap={0}
      >
        <Text bold color="red">
          {figures.cross} Clone failed
        </Text>
        <Text color="white">{stage.message}</Text>
      </Box>
      <Box gap={3}>
        <Shortcut keys={["↵", "Esc"]} label="continue" />
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
    <Box flexDirection="column" gap={1}>
      <History committed={committed} />
      <Box gap={1}>
        <Text bold color="cyan">
          {figures.info}
        </Text>
        <Text bold color="cyan">
          Proposed Changes
        </Text>
        <Text color="gray" dimColor>
          ({patches.length} file{patches.length !== 1 ? "s" : ""})
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        {patches.map((p) => (
          <Box key={p.path} gap={1}>
            <Text color={p.isNew ? "green" : "yellow"}>
              {p.isNew ? "+" : "~"}
            </Text>
            <Text color={p.isNew ? "green" : "yellow"}>{p.path}</Text>
            {p.isNew && (
              <Text color="gray" dimColor>
                (new file)
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
      <Box gap={3}>
        <Shortcut keys={["↑", "↓"]} label="scroll" />
        <Shortcut keys={["↵", "A"]} label="apply" />
        <Shortcut keys={["S", "Esc"]} label="skip" />
      </Box>
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
    <Box flexDirection="column" gap={1}>
      <History committed={committed} />
      <Box gap={1}>
        <Text bold color="cyan">
          {file.path}
        </Text>
        <Text color="gray" dimColor>
          {file.isNew ? "(new file)" : "(modified)"}
        </Text>
      </Box>
      <DiffViewer
        patches={[file.patch]}
        diffs={[diffLines]}
        scrollOffset={scrollOffset}
      />
      <Box gap={3}>
        <Shortcut keys={["↑", "↓"]} label="scroll" />
        <Shortcut keys={["↵", "Esc"]} label="back" />
      </Box>
    </Box>
  );
}
