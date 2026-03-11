import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import figures from "figures";
import { ORANGE } from "../../colors";
import type { Step } from "../../types/repo";

const LABELS: Record<string, string> = {
  cloning: "Cloning repository",
  "fetching-tree": "Fetching repository structure",
  "reading-files": "Reading important files",
};

export const StepRow = ({ step }: { step: Step }) => {
  if (step.type === "error") {
    return (
      <Text color="red">
        {figures.cross} {step.message}
      </Text>
    );
  }

  if (step.type === "folder-exists") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">
          {figures.warning} Folder already exists: {step.repoPath}
        </Text>
        <Text>
          Delete it and re-clone?{"  "}
          <Text color="green">[y] yes</Text>
          {"  "}
          <Text color="red">[n] no, use existing</Text>
        </Text>
      </Box>
    );
  }

  const label = LABELS[step.type] ?? step.type;

  if (step.status === "done") {
    return (
      <Text color="green">
        {figures.tick} {label}
      </Text>
    );
  }

  return (
    <Box>
      <Text color={ORANGE}>
        <Spinner />
      </Text>
      <Box marginLeft={1}>
        <Text>{label}...</Text>
      </Box>
    </Box>
  );
};
