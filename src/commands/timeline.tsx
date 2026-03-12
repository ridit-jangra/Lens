import React from "react";
import { Box, Text } from "ink";
import figures from "figures";
import { existsSync } from "fs";
import path from "path";
import { TimelineRunner } from "../components/timeline/TimelineRunner";

export const TimelineCommand = ({ path: inputPath }: { path: string }) => {
  const resolvedPath = path.resolve(inputPath);

  if (!existsSync(resolvedPath)) {
    return (
      <Box marginTop={1}>
        <Text color="red">
          {figures.cross} Path not found: {resolvedPath}
        </Text>
      </Box>
    );
  }

  return <TimelineRunner repoPath={resolvedPath} />;
};
