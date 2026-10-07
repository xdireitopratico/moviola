import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { colorClip } from "../worker/concat.ts";
import { ingestLocalVideo, probeDuration, trimClip } from "./ingest.ts";

test("083 ingerir vídeo local cria clipe com duração lida", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-083-"));
  const src = join(dir, "src.mp4");
  const dest = join(dir, "ingested.mp4");
  try {
    await colorClip(src, "red");
    const scene = await ingestLocalVideo(src, dest, 0);
    expect(scene.status).toBe("pronta");
    expect(scene.filePath).toBe(dest);
    expect(scene.durationSeconds).toBeGreaterThan(0.5);
    expect(await probeDuration(dest)).toBeGreaterThan(0.5);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("084 recortar trecho do arquivo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-084-"));
  const src = join(dir, "src.mp4");
  const dest = join(dir, "trim.mp4");
  try {
    const { spawn } = await import("node:child_process");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "ffmpeg",
        ["-y", "-f", "lavfi", "-i", "color=c=blue:s=320x240:d=3", "-pix_fmt", "yuv420p", src],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg"))));
    });
    await trimClip(src, dest, 0.5, 1);
    const duration = await probeDuration(dest);
    expect(duration).toBeGreaterThan(0.5);
    expect(duration).toBeLessThan(2.5);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
