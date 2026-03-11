import { Box, Text, useInput } from "ink";
import figures from "figures";
import { useState } from "react";
import { iconForFile } from "../../utils/files";
import { FileViewer } from "./FileViewer";
import type { ImportantFile, ReviewStage } from "../../types/repo";

export const FileReviewer = ({
  files,
  onDone,
}: {
  files: ImportantFile[];
  onDone: () => void;
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [reviewStage, setReviewStage] = useState<ReviewStage>("list");

  useInput((_, key) => {
    if (reviewStage === "file") return;

    if (key.upArrow) setSelectedIndex((i) => Math.max(0, i - 1));
    if (key.downArrow)
      setSelectedIndex((i) => Math.min(files.length - 1, i + 1));
    if (key.return || key.rightArrow) setReviewStage("file");
    if (key.escape) onDone();
    if (key.rightArrow) onDone();
  });

  if (reviewStage === "file") {
    const file = files[selectedIndex];
    if (!file) return null;
    return (
      <FileViewer
        file={file}
        index={selectedIndex}
        total={files.length}
        onBack={() => setReviewStage("list")}
      />
    );
  }

  return (
    <Box flexDirection="column" marginTop={1} gap={1}>
      <Text bold color="cyan">
        {figures.hamburger} {files.length} important file(s) found
        <Text color="gray">
          {"  "}↑↓ navigate · enter to open · → next step · esc to skip
        </Text>
      </Text>

      <Box flexDirection="column">
        {files.map((file, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box key={file.path} marginLeft={1}>
              <Text color={isSelected ? "cyan" : "yellow"}>
                {isSelected ? figures.arrowRight : " "}
                {"  "}
                {iconForFile(file.path)}
                {"  "}
                {file.path}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
