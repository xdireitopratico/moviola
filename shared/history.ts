import type { Scene } from "./contract.ts";

export interface ClipHistory {
  past: Scene[][];
  present: Scene[];
  future: Scene[][];
}

export function createHistory(scenes: Scene[]): ClipHistory {
  return { past: [], present: scenes.map((scene) => ({ ...scene })), future: [] };
}

export function editClips(history: ClipHistory, next: Scene[]): ClipHistory {
  return {
    past: [...history.past, history.present],
    present: next.map((scene) => ({ ...scene })),
    future: [],
  };
}

export function undo(history: ClipHistory): ClipHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history: ClipHistory): ClipHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}
