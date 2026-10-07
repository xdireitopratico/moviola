import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClipRequest } from "../shared/contract.ts";

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    const errors: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(errors).toString("utf8") || `${command} saiu ${code}`));
    });
  });
}

export async function colorClip(dest: string, color: string): Promise<void> {
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=320x240:d=1`,
    "-pix_fmt",
    "yuv420p",
    dest,
  ]);
}

export async function applyColor(source: string, dest: string, brightness: number): Promise<void> {
  await run("ffmpeg", [
    "-y",
    "-i",
    source,
    "-vf",
    `eq=brightness=${brightness}`,
    "-pix_fmt",
    "yuv420p",
    dest,
  ]);
}

export const colorAdjustmentEnabled = true;

export async function applyKenBurns(source: string, dest: string, startScale: number, endScale: number): Promise<void> {
  const z = `min(zoom+0.0015,${endScale})`;
  const filter = `scale=800:600,zoompan=z='if(eq(on,1),${startScale},${z})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=25:s=320x240`;
  await run("ffmpeg", ["-y", "-i", source, "-vf", filter, "-pix_fmt", "yuv420p", dest]);
}

export async function splitClip(
  source: string,
  atSeconds: number,
  leftDest: string,
  rightDest: string,
): Promise<void> {
  await run("ffmpeg", ["-y", "-i", source, "-t", String(atSeconds), "-c", "copy", leftDest]);
  await run("ffmpeg", ["-y", "-ss", String(atSeconds), "-i", source, "-c", "copy", rightDest]);
}

export async function concatClips(clips: string[], dest: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "moviola-concat-"));
  const list = join(dir, "list.txt");
  const lines = clips.map((clip) => `file '${clip.replaceAll("'", "'\\''")}'`).join("\n");
  await writeFile(list, lines);
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", dest]);
}

export async function renderClipEffects(effects: ClipRequest[], dest: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "moviola-fx-"));
  const prepared: string[] = [];
  for (const [index, effect] of effects.entries()) {
    let current = effect.path;
    if (effect.colorBrightness !== 0) {
      const colored = join(dir, `color-${index}.mp4`);
      await applyColor(current, colored, effect.colorBrightness);
      current = colored;
    }
    if (effect.kenBurns.enabled) {
      const burned = join(dir, `kb-${index}.mp4`);
      await applyKenBurns(current, burned, effect.kenBurns.startScale, effect.kenBurns.endScale);
      current = burned;
    }
    prepared.push(current);
  }
  await concatClips(prepared, dest);
}
