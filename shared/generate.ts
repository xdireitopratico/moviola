import type { Scene } from "./contract.ts";

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
