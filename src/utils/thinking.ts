import { useState, useEffect } from "react";

const PHRASES = [
  "marinating on that...",
  "letting it simmer...",
  "preheating the brain...",
  "seasoning the response...",
  "slow cooking an answer...",
  "whisking it together...",
  "folding in the context...",
  "reducing the codebase...",
  "deglazing with tokens...",
  "plating the thoughts...",

  "shipping neurons...",
  "diffing the vibes...",
  "grepping the matrix...",
  "pushing to brainstem...",
  "rebasing thoughts...",
  "compiling feelings...",
  "hot reloading ideas...",
  "touching grass mentally...",
  "npm install wisdom...",
  "resolving merge conflicts in head...",
  "squashing dumb thoughts...",
  "git blame on myself...",
  "yarn linking synapses...",
  "type checking the universe...",
  "tree shaking nonsense...",

  "no cap, thinking hard...",
  "lowkey computing...",
  "in my bag rn...",
  "it's giving... processing...",
  "understood the assignment...",
  "era of thinking...",
  "main character moment...",
  "this is the way...",
  "based response incoming...",
  "big brain time...",
  "galaxy brained...",
  "cooked something up...",
  "chefkiss incoming...",
  "slay mode: on...",
  "rizzing up an answer...",

  "consulting the void...",
  "asking my other personalities...",
  "reading the codebase tea leaves...",
  "vibing with your files...",
  "channeling senior engineer energy...",
  "pretending i know what i'm doing...",
  "staring at the wall (productively)...",
  "definitely not making this up...",
];

export function useThinkingPhrase(active: boolean, intervalMs = 2200): string {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * PHRASES.length),
  );

  useEffect(() => {
    if (!active) return;
    // Randomise on activation
    setIndex(Math.floor(Math.random() * PHRASES.length));
    const id = setInterval(() => {
      setIndex((i) => {
        // Pick a different one each time
        let next = Math.floor(Math.random() * PHRASES.length);
        if (next === i) next = (next + 1) % PHRASES.length;
        return next;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return PHRASES[index]!;
}
