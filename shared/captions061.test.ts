import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession } from "./contract.ts";
import { buildSrt } from "./srt.ts";
import { readSession, saveSession, setCaptions, setMusic } from "./store.ts";

test("061 legendas e trilha gravam na sessão", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-061-"));
  try {
    const session = createSession(
      { theme: "Porto", durationSeconds: 8, aspectRatio: "16:9", style: "Documental" },
      "2026-10-06T00:00:00.000Z",
    );
    const scene = session.scenes[0];
    if (!scene) throw new Error("cena");
    session.scenes = [{ ...scene, narration: "Olá porto", durationSeconds: 2 }];
    const srt = buildSrt(session.scenes, session.voice);
    const saved = setMusic(
      setCaptions(session, { enabled: true, srt }, "2026-10-06T00:01:00.000Z"),
      { enabled: true, filePath: "terra", volume: 0.28, fadeInSeconds: 1.2, fadeOutSeconds: 2 },
      "2026-10-06T00:01:01.000Z",
    );
    await saveSession(dir, saved);
    const read = await readSession(dir, session.id);
    expect(read.captions.enabled).toBe(true);
    expect(read.captions.srt).toContain("Olá porto");
    expect(read.music).toEqual({
      enabled: true,
      filePath: "terra",
      volume: 0.28,
      fadeInSeconds: 1.2,
      fadeOutSeconds: 2,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
