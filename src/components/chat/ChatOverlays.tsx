import React from "react";
import { Box, Text, Static } from "ink";
import Spinner from "ink-spinner";
import figures from "figures";
import { ORANGE } from "../../colors";
import { DiffViewer } from "../repo/DiffViewer";
import { StaticMessage } from "./ChatMessage";
import type { DiffLine, FilePatch } from "../repo/DiffViewer";
import type { Message, ToolCall, ChatStage } from "../../types/chat";

// ── Permission prompt ─────────────────────────────────────────────────────────

export function PermissionPrompt({
  tool,
  onDecide,
}: {
  tool: ToolCall;
  onDecide: (approved: boolean) => void;
}) {
  const isShell = tool.type === "shell";
  return (
    <Box
      flexDirection="column"
      gap={1}
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      marginY={1}
    >
      <Text bold color="yellow">
        {figures.warning} Permission Request
      </Text>
      <Box gap={1}>
        <Text color="gray">{isShell ? "Run command:" : "Fetch URL:"}</Text>
        <Text color={isShell ? "red" : "cyan"} bold>
          {isShell
            ? (tool as { type: "shell"; command: string }).command
            : (tool as { type: "fetch"; url: string }).url}
        </Text>
      </Box>
      <Text color="gray">Y/enter to allow · N/esc to deny</Text>
    </Box>
  );
}

// ── Input box ─────────────────────────────────────────────────────────────────

export function InputBox({ value }: { value: string }) {
  return (
    <Box gap={1} borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color="cyan">&gt;</Text>
      <Text color="white">{value}</Text>
      <Text color="gray">█</Text>
    </Box>
  );
}

// ── Shared history header ─────────────────────────────────────────────────────

function History({ committed }: { committed: Message[] }) {
  return (
    <Static items={committed}>
      {(msg, i) => <StaticMessage key={i} msg={msg} />}
    </Static>
  );
}

// ── Clone stage renders ───────────────────────────────────────────────────────

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
        <Text color="gray" dimColor>
          Y/enter to clone · N/esc to skip
        </Text>
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
          ...
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
        <Text color="gray" dimColor>
          Y to re-clone · N to use existing
        </Text>
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
          {figures.tick} Cloned
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
          <Text color="white">{stage.fileCount} files</Text>
        </Box>
      </Box>
      <Text color="gray" dimColor>
        enter or esc to continue
      </Text>
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
      <Text color="gray" dimColor>
        enter or esc to continue
      </Text>
    </Box>
  );
}

// ── Preview and viewing-file renders ─────────────────────────────────────────

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
      <Text bold color="cyan">
        {figures.info} Proposed Changes
      </Text>
      <Box flexDirection="column">
        {patches.map((p) => (
          <Text key={p.path} color={p.isNew ? "green" : "yellow"}>
            {"  "}
            {p.isNew ? figures.tick : figures.bullet} {p.path}
            {p.isNew && <Text color="gray"> (new)</Text>}
          </Text>
        ))}
      </Box>
      <DiffViewer
        patches={patches}
        diffs={diffLines}
        scrollOffset={scrollOffset}
      />
      <Text color="gray">↑↓ scroll · enter/A to apply · S/esc to skip</Text>
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
        <Text color="gray">{file.isNew ? "(new file)" : "(modified)"}</Text>
      </Box>
      <DiffViewer
        patches={[file.patch]}
        diffs={[diffLines]}
        scrollOffset={scrollOffset}
      />
      <Text color="gray">↑↓ scroll · esc or enter to go back</Text>
    </Box>
  );
}
