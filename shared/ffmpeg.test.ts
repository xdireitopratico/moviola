import { expect, test } from "bun:test";
import { probeFfmpeg } from "./ffmpeg.ts";

test("062 probe do ffmpeg local acha caminho e versão", async () => {
  const probe = await probeFfmpeg();
  expect(probe.found).toBe(true);
  if (!probe.found) return;
  expect(probe.path.length).toBeGreaterThan(0);
  expect(probe.path.includes("ffmpeg")).toBe(true);
  expect(probe.version.length).toBeGreaterThan(0);
});

test("062 probe com comando inexistente não acha", async () => {
  const probe = await probeFfmpeg("ffmpeg-moviola-nao-existe");
  expect(probe).toEqual({ found: false, path: null, version: null });
});
