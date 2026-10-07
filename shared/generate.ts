import { writeFile } from "node:fs/promises";
import type { Scene } from "./contract.ts";

type WriteClip = (path: string, bytes: Uint8Array) => Promise<void>;

export async function requestClip(scene: Scene, url: string | null, fetchImpl: typeof fetch = fetch): Promise<Scene> {
  if (!url) {
    return { ...scene, status: "falhou", reason: "sem url", filePath: null };
  }
  const response = await fetchImpl(url);
  if (!response.ok) {
    return { ...scene, status: "falhou", reason: `http ${response.status}`, filePath: null };
  }
  return scene;
}

export async function runQueue(scenes: Scene[], step: (scene: Scene) => Promise<Scene>): Promise<Scene[]> {
  const ordered = [...scenes].sort((a, b) => a.index - b.index);
  const done: Scene[] = [];
  let busy = false;
  for (const scene of ordered) {
    if (busy) throw new Error("fila paralela");
    busy = true;
    const finished = await step({ ...scene, status: "gerando", reason: null });
    busy = false;
    done.push(finished);
  }
  return done;
}

export async function storeClip(
  scene: Scene,
  bytes: Uint8Array,
  destPath: string,
  write: WriteClip = writeFile,
): Promise<Scene> {
  await write(destPath, bytes);
  return { ...scene, status: "pronta", filePath: destPath, reason: null };
}
