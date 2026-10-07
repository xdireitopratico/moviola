import { copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { defaultScene, type Scene } from "./contract.ts";

function run(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
  });
}

export async function probeDuration(path: string): Promise<number> {
  const result = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    path,
  ]);
  if (result.code !== 0) throw new Error(result.stderr || "ffprobe falhou");
  const duration = Number(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("duração inválida");
  return duration;
}

export async function ingestLocalVideo(
  sourcePath: string,
  destPath: string,
  index = 0,
): Promise<Scene> {
  await copyFile(sourcePath, destPath);
  const durationSeconds = await probeDuration(destPath);
  return defaultScene({
    id: crypto.randomUUID(),
    index,
    title: "Ingerido",
    durationSeconds,
    status: "pronta",
    filePath: destPath,
  });
}

export async function trimClip(
  sourcePath: string,
  destPath: string,
  startSeconds: number,
  durationSeconds: number,
): Promise<void> {
  if (startSeconds < 0 || durationSeconds <= 0) throw new Error("recorte inválido");
  const result = await run("ffmpeg", [
    "-y",
    "-ss",
    String(startSeconds),
    "-i",
    sourcePath,
    "-t",
    String(durationSeconds),
    "-c",
    "copy",
    destPath,
  ]);
  if (result.code !== 0) throw new Error(result.stderr || "ffmpeg trim falhou");
}
