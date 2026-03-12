import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import figures from "figures";
import { useEffect, useState, useRef } from "react";
import { ACCENT } from "../../colors";
import { detectPreview, runInstall, runDev } from "../../utils/preview";
import type { PreviewProcess } from "../../utils/preview";

type PreviewStage =
  | { type: "detecting" }
  | { type: "not-supported" }
  | { type: "installing"; logs: string[] }
  | { type: "starting"; logs: string[] }
  | { type: "running"; port: number | null; logs: string[] }
  | { type: "error"; message: string };

const MAX_LOGS = 8;

export const PreviewRunner = ({
  repoPath,
  onExit,
}: {
  repoPath: string;
  onExit: () => void;
}) => {
  const [stage, setStage] = useState<PreviewStage>({ type: "detecting" });
  const devProcess = useRef<PreviewProcess | null>(null);

  useInput((_, key) => {
    if (key.escape || (key.ctrl && _.toLowerCase() === "c")) {
      devProcess.current?.kill();
      onExit();
    }
  });

  useEffect(() => {
    const info = detectPreview(repoPath);
    if (!info) {
      setStage({ type: "not-supported" });
      return;
    }

    setStage({ type: "installing", logs: [] });
    const installer = runInstall(repoPath, info.installCmd);
    const installLogs: string[] = [];

    installer.onLog((line) => {
      installLogs.push(line);
      setStage({ type: "installing", logs: [...installLogs].slice(-MAX_LOGS) });
    });
    installer.onError((line) => {
      installLogs.push(line);
      setStage({ type: "installing", logs: [...installLogs].slice(-MAX_LOGS) });
    });
    installer.onExit((code) => {
      if (code !== 0 && code !== null) {
        setStage({
          type: "error",
          message: `Install failed with exit code ${code}`,
        });
        return;
      }

      setStage({ type: "starting", logs: [] });
      const dev = runDev(repoPath, info.devCmd);
      devProcess.current = dev;
      const devLogs: string[] = [];

      dev.onLog((line) => {
        devLogs.push(line);
        const isRunning =
          line.toLowerCase().includes("localhost") ||
          line.toLowerCase().includes("ready") ||
          line.toLowerCase().includes("started") ||
          line.toLowerCase().includes("listening");

        if (isRunning) {
          setStage({
            type: "running",
            port: info.port,
            logs: [...devLogs].slice(-MAX_LOGS),
          });
        } else {
          setStage((s) =>
            s.type === "running"
              ? { ...s, logs: [...devLogs].slice(-MAX_LOGS) }
              : { type: "starting", logs: [...devLogs].slice(-MAX_LOGS) },
          );
        }
      });

      dev.onError((line) => {
        devLogs.push(line);
        setStage((s) =>
          s.type === "running"
            ? { ...s, logs: [...devLogs].slice(-MAX_LOGS) }
            : { type: "starting", logs: [...devLogs].slice(-MAX_LOGS) },
        );
      });

      dev.onExit((code) => {
        if (code !== 0 && code !== null) {
          setStage({
            type: "error",
            message: `Dev server exited with code ${code}`,
          });
        }
      });
    });

    return () => {
      devProcess.current?.kill();
    };
  }, [repoPath]);

  if (stage.type === "detecting") {
    return (
      <Box marginTop={1}>
        <Text color={ACCENT}>
          <Spinner />
        </Text>
        <Box marginLeft={1}>
          <Text>Detecting project type...</Text>
        </Box>
      </Box>
    );
  }

  if (stage.type === "not-supported") {
    return (
      <Box marginTop={1}>
        <Text color="yellow">
          {figures.warning} No supported run configuration found (no
          package.json, requirements.txt, etc.)
        </Text>
      </Box>
    );
  }

  if (stage.type === "installing") {
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Box>
          <Text color={ACCENT}>
            <Spinner />
          </Text>
          <Box marginLeft={1}>
            <Text>Installing dependencies...</Text>
          </Box>
        </Box>
        <Box flexDirection="column" marginLeft={2}>
          {stage.logs.map((log, i) => (
            <Text key={i} color="gray">
              {log}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  if (stage.type === "starting") {
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Box>
          <Text color={ACCENT}>
            <Spinner />
          </Text>
          <Box marginLeft={1}>
            <Text>Starting dev server...</Text>
          </Box>
        </Box>
        <Box flexDirection="column" marginLeft={2}>
          {stage.logs.map((log, i) => (
            <Text key={i} color="gray">
              {log}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  if (stage.type === "running") {
    return (
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Box gap={1}>
          <Text color="green">{figures.tick} Dev server running</Text>
          {stage.port && (
            <Text color="cyan">→ http://localhost:{stage.port}</Text>
          )}
        </Box>
        <Box flexDirection="column" marginLeft={2}>
          {stage.logs.map((log, i) => (
            <Text key={i} color="gray">
              {log}
            </Text>
          ))}
        </Box>
        <Text color="gray">ctrl+c or esc to stop</Text>
      </Box>
    );
  }

  if (stage.type === "error") {
    return (
      <Box marginTop={1}>
        <Text color="red">
          {figures.cross} {stage.message}
        </Text>
      </Box>
    );
  }

  return null;
};
