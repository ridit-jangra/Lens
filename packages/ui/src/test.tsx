import React from "react";
import { Markdown } from "./components/Markdown";
import { render } from "ink";

render(
  <Markdown>
    {`# Heading
  **bold text** and _italic_
  
  \`\`\`js
  const x = 1
  \`\`\`
  | name | type | value |
|------|------|-------|
| x    | int  | 1     |
  `}
  </Markdown>,
);
