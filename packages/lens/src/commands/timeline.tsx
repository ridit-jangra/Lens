import React from "react";
import { Box } from "ink";
import { TimelineRunner } from "../components/timeline/TimelineRunner";

export function TimelineCommand({ path }: { path: string }) {
  return (
    <Box flexDirection="column">
      <TimelineRunner repoPath={path} />
    </Box>
  );
}
