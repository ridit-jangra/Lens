import React from "react";
import { Box } from "ink";
import { ProviderSetup } from "../components/provider/ProviderSetup";

export function ProviderCommand() {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <ProviderSetup onDone={() => process.exit(0)} />
    </Box>
  );
}
