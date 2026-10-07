import { readFile } from "node:fs/promises";
import { buildPostProdRequest, type Session } from "./contract.ts";
import { applyCallback } from "./callback.ts";
import { probeFfmpeg, type FfmpegProbe } from "./ffmpeg.ts";
import { concatClips } from "../worker/concat.ts";

export async function callWorker(
  session: Session,
  workerUrl: string | null,
  destPath: string,
  now: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Session> {
  if (!workerUrl) {
    return applyCallback(session, { ok: false, reason: "sem url" }, destPath, now);
  }
  const built = buildPostProdRequest(session, "app://callback");
  if (!built.ok) {
    return applyCallback(session, { ok: false, reason: built.reason }, destPath, now);
  }
  try {
    const response = await fetchImpl(workerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, callback: "app://callback" }),
    });
    if (!response.ok) {
      return applyCallback(session, { ok: false, reason: `http ${response.status}` }, destPath, now);
    }
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("video/mp4")) {
      return applyCallback(session, { ok: false, reason: "resposta sem mp4" }, destPath, now);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return applyCallback(session, { ok: true, bytes }, destPath, now);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "falha de rede";
    return applyCallback(session, { ok: false, reason }, destPath, now);
  }
}

type ConcatFn = (clips: string[], dest: string) => Promise<void>;

export async function renderLocal(
  session: Session,
  destPath: string,
  now: string,
  concat: ConcatFn = concatClips,
): Promise<Session> {
  const built = buildPostProdRequest(session, "app://callback");
  if (!built.ok) {
    return applyCallback(session, { ok: false, reason: built.reason }, destPath, now);
  }
  try {
    await concat(built.request.clips, destPath);
    const bytes = new Uint8Array(await readFile(destPath));
    return applyCallback(session, { ok: true, bytes }, destPath, now);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "ffmpeg local falhou";
    return applyCallback(session, { ok: false, reason }, destPath, now);
  }
}

export interface RenderOptions {
  probe?: () => Promise<FfmpegProbe>;
  workerUrl?: string | null;
  fetchImpl?: typeof fetch;
  concat?: ConcatFn;
}

export async function renderSession(
  session: Session,
  destPath: string,
  now: string,
  options: RenderOptions = {},
): Promise<Session> {
  const probe = await (options.probe ?? probeFfmpeg)();
  if (probe.found) {
    return renderLocal(session, destPath, now, options.concat);
  }
  return callWorker(session, options.workerUrl ?? null, destPath, now, options.fetchImpl);
}
