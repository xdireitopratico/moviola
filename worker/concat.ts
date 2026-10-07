import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

export async function concatClips(clips: string[], dest: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "moviola-concat-"));
  const list = join(dir, "list.txt");
  const lines = clips.map((clip) => `file '${clip.replaceAll("'", "'\\''")}'`).join("\n");
  await writeFile(list, lines);
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", dest]);
}
