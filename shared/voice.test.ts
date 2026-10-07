import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultVoice } from "./contract.ts";
import { previewVoice } from "./voice.ts";

test("055 pré-escuta baixa um áudio", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-voice-"));
  const dest = join(dir, "preview.wav");
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    expect(url.searchParams.get("voice")).toBe("clara");
    expect(url.searchParams.get("speed")).toBe("1.2");
    expect(url.searchParams.get("text")).toBe("olá");
    res.writeHead(200, { "content-type": "audio/wav" });
    res.end("RIFF-audio");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta");
  try {
    const voice = { ...defaultVoice(), id: "clara", speed: 1.2 };
    const result = await previewVoice(voice, "olá", `http://127.0.0.1:${address.port}/tts`, dest);
    expect(result).toEqual({ ok: true, filePath: dest });
    expect(await readFile(dest, "utf8")).toBe("RIFF-audio");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("055 pré-escuta falha com motivo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-voice-f-"));
  try {
    const noUrl = await previewVoice(defaultVoice(), "texto", null, join(dir, "a.wav"));
    expect(noUrl).toEqual({ ok: false, reason: "sem url" });
    const empty = await previewVoice(defaultVoice(), "  ", "http://127.0.0.1:9/tts", join(dir, "b.wav"));
    expect(empty).toEqual({ ok: false, reason: "sem texto" });
    const server = createServer((_req, res) => {
      res.writeHead(500);
      res.end("erro");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("porta");
    try {
      const failed = await previewVoice(
        defaultVoice(),
        "texto",
        `http://127.0.0.1:${address.port}/tts`,
        join(dir, "c.wav"),
      );
      expect(failed).toEqual({ ok: false, reason: "http 500" });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
