import React from "react";
import { Box } from "ink";
import { TimelineRunner } from "../components/timeline/TimelineView";

export function TimelineCommand({ path }: { path: string }) {
  return (
    <Box flexDirection="column">
      <TimelineRunner repoPath={path} />
    </Box>
  );
}
