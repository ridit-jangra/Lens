import { useEffect, useState } from "react";

const PHRASES: Record<string, string[]> = {
  general: [
    // ── cooking ──────────────────────────────────────────────────
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

    // ── dev ──────────────────────────────────────────────────────
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

    // ── gen z ────────────────────────────────────────────────────
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
    "rizzing up a baddie answer...",
    "sigma grindset: activated...",
    "NPC behavior: disabled...",
    "unaliving my writer's block...",
    "caught in 4K thinking...",
    "delulu but make it accurate...",
    "ate and left no crumbs...",
    "rent free in the codebase...",
    "understood the assignment (fr fr)...",
    "giving main character energy...",
    "no thoughts, head full...",
    "built different response incoming...",
    "chronically online and loving it...",
    "touch grass? not yet...",
    "this response is bussin...",
    "lowkey highkey computing...",
    "it's giving Einstein...",
    "we do a little thinking...",
    "gigachad analysis mode...",
    "the audacity to be this smart...",

    "consulting the void...",
    "asking my other personalities...",
    "reading the codebase tea leaves...",
    "vibing with your files...",
    "channeling senior engineer energy...",
    "pretending i know what i'm doing...",
    "staring at the wall (productively)...",
    "definitely not making this up...",
  ],

  cloning: [
    "cloning at the speed of git...",
    "negotiating with github...",
    "untangling the object graph...",
    "counting commits like sheep...",
    "shallow clone, deep thoughts...",
    "fetching the whole iceberg...",
    "packing objects...",
    "resolving deltas...",
    "checking out the vibes...",
    "recursing into submodules...",
    "buffering the bits...",
    "git is being git...",
    "praying to the network gods...",
    "downloading the internet (just your repo)...",
  ],

  analyzing: [
    "reading every file (skimming)...",
    "building a mental model...",
    "reverse engineering intent...",
    "parsing the chaos...",
    "connecting the dots...",
    "finding the load-bearing files...",
    "mapping the dependency graph...",
    "absorbing the architecture...",
    "noticing things...",
    "judging your folder structure...",
    "appreciating the tech debt...",
    "counting your TODOs...",
    "reading between the lines...",
    "anthropic-ifying your codebase...",
    "following the import trail...",
    "speed-reading your life's work...",
    "pretending to understand your monorepo...",
  ],

  model: [
    "deciding which files matter...",
    "picking the important ones...",
    "triaging your codebase...",
    "figuring out where to look...",
    "consulting the file oracle...",
    "narrowing it down...",
    "skimming the directory...",
    "choosing wisely...",
    "not reading everything (smart)...",
    "filtering the noise...",
    "asking the oracle...",
    "pinging the motherbrain...",
    "waiting on the neurons...",
    "tokens incoming...",
    "model is cooking...",
    "inference in progress...",
    "the GPU is thinking...",
    "attention is all we need...",
    "cross-attending to your vibes...",
    "softmaxing the options...",
    "sampling from the distribution...",
    "temperature: just right...",
    "context window: not full yet...",
    "next token any second now...",
    "beaming thoughts from the datacenter...",
    "anthropic servers sweating...",
    "matrix multiply in progress...",
  ],
  summary: [
    "synthesizing the chaos...",
    "forming an opinion...",
    "writing the verdict...",
    "digesting everything...",
    "putting it all together...",
    "crafting the overview...",
    "making sense of it all...",
    "distilling the essence...",
    "summarizing your life's work...",
    "turning files into feelings...",
    "extracting signal from noise...",
    "generating hot takes...",
    "cooking up the analysis...",
    "almost done judging your code...",
    "writing the report card...",
  ],

  task: [
    "thinking about your ask...",
    "processing the request...",
    "on it...",
    "got it, working...",
    "considering the angles...",
    "thinking this through...",
    "working on it...",
    "cooking up a plan...",
    "breaking it down...",
    "figuring out the approach...",
    "strategizing...",
    "mapping out the steps...",
    "scoping the work...",
    "locking in...",
    "challenge accepted...",
  ],
};

function pick(list: string[], lastIndex: number): number {
  let next = Math.floor(Math.random() * list.length);
  if (next === lastIndex) next = (next + 1) % list.length;
  return next;
}

export type ThinkingKind = keyof typeof PHRASES;

export function useThinkingPhrase(
  active: boolean,
  kind: ThinkingKind = "general",
  intervalMs = 4321,
): string {
  const list = PHRASES[kind]!;
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * list.length),
  );

  useEffect(() => {
    if (!active) return;
    setIndex((i) => pick(list, i));
    const id = setInterval(() => setIndex((i) => pick(list, i)), intervalMs);
    return () => clearInterval(id);
  }, [active, kind, intervalMs]);

  return list[index]!;
}
