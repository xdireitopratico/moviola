import { spawn } from "node:child_process";

export type FfmpegProbe =
  | { found: true; path: string; version: string }
  | { found: false; path: null; version: null };

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

function parseVersion(text: string): string | null {
  const match = text.match(/ffmpeg\s+version\s+(\S+)/i);
  return match?.[1] ?? null;
}

export async function probeFfmpeg(command = "ffmpeg"): Promise<FfmpegProbe> {
  try {
    const which = await run("which", [command]);
    if (which.code !== 0) {
      return { found: false, path: null, version: null };
    }
    const path = which.stdout.trim().split("\n")[0]?.trim() ?? "";
    if (!path) return { found: false, path: null, version: null };
    const info = await run(path, ["-version"]);
    const version = parseVersion(info.stdout) ?? parseVersion(info.stderr);
    if (!version) return { found: false, path: null, version: null };
    return { found: true, path, version };
  } catch {
    return { found: false, path: null, version: null };
  }
}
