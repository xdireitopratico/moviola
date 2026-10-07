import type { Scene, VoiceSettings } from "./contract.ts";

function stamp(totalSeconds: number): string {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

export function buildSrt(scenes: Scene[], voice: VoiceSettings): string {
  const ordered = [...scenes].sort((a, b) => a.index - b.index);
  const blocks: string[] = [];
  let cursor = 0;
  let index = 1;
  for (const scene of ordered) {
    const text = scene.narration.trim();
    if (!text) {
      cursor += scene.durationSeconds + voice.pauseBetweenScenesSeconds;
      continue;
    }
    const start = cursor;
    const end = cursor + scene.durationSeconds;
    blocks.push(`${index}\n${stamp(start)} --> ${stamp(end)}\n${text}`);
    index += 1;
    cursor = end + voice.pauseBetweenScenesSeconds;
  }
  return blocks.join("\n\n");
}
