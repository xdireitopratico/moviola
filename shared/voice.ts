import { writeFile } from "node:fs/promises";
import type { VoiceSettings } from "./contract.ts";

export type PreviewResult =
  | { ok: true; filePath: string }
  | { ok: false; reason: string };

type WriteAudio = (path: string, bytes: Uint8Array) => Promise<void>;

export async function previewVoice(
  voice: VoiceSettings,
  text: string,
  url: string | null,
  destPath: string,
  fetchImpl: typeof fetch = fetch,
  write: WriteAudio = writeFile,
): Promise<PreviewResult> {
  if (!url) {
    return { ok: false, reason: "sem url" };
  }
  if (!text.trim()) {
    return { ok: false, reason: "sem texto" };
  }
  const endpoint = new URL(url);
  endpoint.searchParams.set("voice", voice.id);
  endpoint.searchParams.set("speed", String(voice.speed));
  endpoint.searchParams.set("text", text);
  try {
    const response = await fetchImpl(endpoint);
    if (!response.ok) {
      return { ok: false, reason: `http ${response.status}` };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    await write(destPath, bytes);
    return { ok: true, filePath: destPath };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "falha de rede";
    return { ok: false, reason };
  }
}
