import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession, defaultScene, setTranslation, auditScene } from "./contract.ts";
import { dubNarration, fillFromSlides, generateAvatar, insertStockScene, searchStock } from "./tools.ts";

const launch = { theme: "Ferramentas", durationSeconds: 40, aspectRatio: "16:9", style: "Documental" };

test("085 traduzir guarda tradução ao lado e travada não perde original", () => {
  const scene = defaultScene({ id: "c1", index: 0, narration: "original", status: "travada" });
  const translated = setTranslation(scene, "translated");
  expect(translated.narration).toBe("original");
  expect(translated.translation).toBe("translated");
  expect(translated.status).toBe("travada");
});

test("086 dublagem gera áudio e substitui narração da sessão", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-086-"));
  const dest = join(dir, "dub.wav");
  const server = createServer((_req, res) => {
    res.writeHead(200);
    res.end("DUB-AUDIO");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta");
  try {
    const session = createSession(launch, "2026-10-06T00:00:00.000Z");
    const dubbed = await dubNarration(session, `http://127.0.0.1:${address.port}/dub`, dest, "2026-10-06T01:00:00.000Z");
    expect(dubbed.narrationUrl).toBe(dest);
    expect(await readFile(dest, "utf8")).toBe("DUB-AUDIO");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("087 busca de stock e inserir usa a mesma fila", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-087-"));
  const dest = join(dir, "stock.mp4");
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/search") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ results: [{ id: "s1", title: "Mar", url: `http://127.0.0.1:${(server.address() as { port: number }).port}/clip` }] }));
      return;
    }
    res.writeHead(200);
    res.end("STOCK");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta");
  try {
    const options = await searchStock("mar", `http://127.0.0.1:${address.port}/search`);
    expect(options).toHaveLength(1);
    const session = createSession(launch, "2026-10-06T00:00:00.000Z");
    const next = await insertStockScene(session, options[0]!, dest, "2026-10-06T01:00:00.000Z");
    expect(next.scenes).toHaveLength(2);
    expect(next.scenes[1]?.status).toBe("pronta");
    expect(next.scenes[1]?.filePath).toBe(dest);
    expect(await readFile(dest, "utf8")).toBe("STOCK");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("088 avatar usa a mesma fila de geração", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-088-"));
  const dest = join(dir, "avatar.mp4");
  const server = createServer((_req, res) => {
    res.writeHead(200);
    res.end("AVATAR");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta");
  try {
    const scene = defaultScene({ id: "av", index: 0, title: "Avatar" });
    const done = await generateAvatar(scene, `http://127.0.0.1:${address.port}/av`, dest);
    expect(done.status).toBe("pronta");
    expect(done.filePath).toBe(dest);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("089 slides viram cenas pelo fillStoryboard", () => {
  const session = createSession(launch, "2026-10-06T00:00:00.000Z");
  const filled = fillFromSlides(session, ["Café", "Colheita", "Xícara"], "2026-10-06T01:00:00.000Z");
  expect(filled.scenes.length).toBe(4);
  expect(filled.launch.theme).toContain("Café");
  expect(filled.scenes[0]?.narration).toContain("Café");
});

test("091 auditoria grava score ou deixa nulo", () => {
  const scene = defaultScene({ id: "a", index: 0 });
  expect(scene.score).toBeNull();
  const audited = auditScene(scene, 0.82);
  expect(audited.score).toBe(0.82);
  expect(auditScene(audited, null).score).toBeNull();
});
