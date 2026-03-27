import React from "react";
import { render } from "ink";
import { Diff } from "./components/Diff";

render(
  <Diff
    filename="auth/index.ts"
    additions={34}
    deletions={12}
    lines={[
      {
        type: "context",
        content: "import express from 'express'",
        lineNumber: 1,
      },
      { type: "add", content: "import jwt from 'jsonwebtoken'", lineNumber: 2 },
      {
        type: "add",
        content: "import { generateRefreshToken } from './tokens'",
        lineNumber: 3,
      },
      {
        type: "remove",
        content: "import { sessions } from './sessions'",
        lineNumber: 4,
      },
      { type: "context", content: "...", lineNumber: 5 },
    ]}
  />,
);
