import { writeFile } from "node:fs/promises";
import { defaultScene, type Scene, type Session } from "./contract.ts";
import { fillStoryboard } from "./operations.ts";
import { runQueue, storeClip } from "./generate.ts";

export interface StockOption {
  id: string;
  title: string;
  url: string;
}

export async function searchStock(
  query: string,
  endpoint: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<StockOption[]> {
  if (!endpoint) throw new Error("sem url");
  if (!query.trim()) return [];
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`http ${response.status}`);
  const payload = (await response.json()) as { results?: StockOption[] };
  return payload.results ?? [];
}

export async function insertStockScene(
  session: Session,
  option: StockOption,
  destPath: string,
  now: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Session> {
  const draft = defaultScene({
    id: crypto.randomUUID(),
    index: session.scenes.length,
    title: option.title,
    prompt: option.title,
    status: "vazia",
  });
  const [ready] = await runQueue([draft], async (scene) => {
    const response = await fetchImpl(option.url);
    if (!response.ok) {
      return { ...scene, status: "falhou", reason: `http ${response.status}`, filePath: null };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return storeClip(scene, bytes, destPath);
  });
  if (!ready) throw new Error("fila vazia");
  return {
    ...session,
    scenes: [...session.scenes, { ...ready, index: session.scenes.length }],
    updatedAt: now,
  };
}

export async function generateAvatar(
  scene: Scene,
  url: string | null,
  destPath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Scene> {
  const [done] = await runQueue([scene], async (current) => {
    if (!url) return { ...current, status: "falhou", reason: "sem url", filePath: null };
    const response = await fetchImpl(url);
    if (!response.ok) {
      return { ...current, status: "falhou", reason: `http ${response.status}`, filePath: null };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return storeClip(current, bytes, destPath);
  });
  if (!done) throw new Error("fila vazia");
  return done;
}

export function fillFromSlides(session: Session, slides: string[], now: string): Session {
  const theme = slides.map((slide) => slide.trim()).filter(Boolean).join(" — ") || session.launch.theme;
  return fillStoryboard({ ...session, launch: { ...session.launch, theme } }, now);
}

export async function dubNarration(
  session: Session,
  url: string | null,
  destPath: string,
  now: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Session> {
  if (!url) {
    return { ...session, narrationUrl: null, reason: "sem url", updatedAt: now };
  }
  const response = await fetchImpl(url);
  if (!response.ok) {
    return { ...session, reason: `http ${response.status}`, updatedAt: now };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(destPath, bytes);
  return { ...session, narrationUrl: destPath, reason: null, updatedAt: now };
}
