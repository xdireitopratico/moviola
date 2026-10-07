import { expect, test } from "bun:test";
import { createSession, defaultVoice } from "./contract.ts";
import { buildSrt } from "./srt.ts";

test("058 gera SRT a partir da narração", () => {
  const session = createSession(
    { theme: "SRT", durationSeconds: 20, aspectRatio: "16:9", style: "Documental" },
    "2026-10-06T00:00:00.000Z",
  );
  const first = session.scenes[0];
  if (!first) throw new Error("cena");
  const scenes = [
    { ...first, id: "a", index: 0, narration: "Primeiro", durationSeconds: 2 },
    { ...first, id: "b", index: 1, narration: "Segundo", durationSeconds: 3 },
  ];
  const voice = { ...defaultVoice(), pauseBetweenScenesSeconds: 0.5 };
  const srt = buildSrt(scenes, voice);
  expect(srt).toContain("Primeiro");
  expect(srt).toContain("Segundo");
  expect(srt).toContain("00:00:00,000 --> 00:00:02,000");
  expect(srt).toContain("00:00:02,500 --> 00:00:05,500");
});
