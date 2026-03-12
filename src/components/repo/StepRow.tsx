import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { ACCENT } from "../../colors";
import { useThinkingPhrase, type ThinkingKind } from "../../utils/thinking";
import type { Step } from "../../types/repo";

const LABELS: Record<string, string> = {
  cloning: "cloning repository",
  "fetching-tree": "fetching repository structure",
  "reading-files": "reading important files",
};

const kindMap: Record<string, ThinkingKind> = {
  cloning: "cloning",
  "fetching-tree": "analyzing",
  "reading-files": "analyzing",
};

function ActiveStep({ type }: { type: string }) {
  const phrase = useThinkingPhrase(true, kindMap[type], 4321);
  const label = LABELS[type] ?? type;
  return (
    <Box gap={1}>
      <Text color={ACCENT}>
        <Spinner />
      </Text>
      <Text color={ACCENT}>{phrase}</Text>
    </Box>
  );
}

export const StepRow = ({ step }: { step: Step }) => {
  if (step.type === "error") {
    return (
      <Box gap={1}>
        <Text color="red">✗</Text>
        <Text color="red">{step.message}</Text>
      </Box>
    );
  }

  if (step.type === "folder-exists") {
    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text color="yellow">!</Text>
          <Text color="gray">folder already exists at </Text>
          <Text color="white">{step.repoPath}</Text>
        </Box>
        <Box gap={1} marginLeft={2}>
          <Text color="gray">y re-clone · n use existing</Text>
        </Box>
      </Box>
    );
  }

  const label = LABELS[step.type] ?? step.type;

  if (step.status === "done") {
    return (
      <Box gap={1}>
        <Text color="green">✓</Text>
        <Text color="gray">{label}</Text>
      </Box>
    );
  }

  return <ActiveStep type={step.type} />;
};
