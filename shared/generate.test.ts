import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession, type Scene } from "./contract.ts";
import { requestClip, runQueue, storeClip } from "./generate.ts";

test("038 sem url a cena fica falhou com motivo", async () => {
  const session = createSession(
    { theme: "Geração", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
    "2026-10-06T00:00:00.000Z",
  );
  const scene = session.scenes[0];
  if (!scene) throw new Error("sessão sem cena");
  const failed = await requestClip(scene, null);
  expect(failed.status).toBe("falhou");
  expect(failed.reason).toBe("sem url");
  expect(failed.filePath).toBeNull();
});

test("039 a fila trata uma cena por vez e ela entra gerando", async () => {
  const session = createSession(
    { theme: "Fila", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
    "2026-10-06T00:00:00.000Z",
  );
  const first = session.scenes[0];
  if (!first) throw new Error("sessão sem cena");
  const second: Scene = { ...first, id: "cena-2", index: 1, title: "Segunda" };
  let busy = 0;
  let max = 0;
  const seen: string[] = [];
  const done = await runQueue([second, first], async (scene) => {
    busy += 1;
    max = Math.max(max, busy);
    seen.push(scene.status);
    await Promise.resolve();
    busy -= 1;
    return { ...scene, status: "falhou", reason: "fim" };
  });
  expect(max).toBe(1);
  expect(seen).toEqual(["gerando", "gerando"]);
  expect(done.map((scene) => scene.id)).toEqual([first.id, "cena-2"]);
  expect(done.every((scene) => scene.status === "falhou")).toBe(true);
});

test("040 o arquivo chega ao disco antes do status pronta", async () => {
  const session = createSession(
    { theme: "Arquivo", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
    "2026-10-06T00:00:00.000Z",
  );
  const scene = session.scenes[0];
  if (!scene) throw new Error("sessão sem cena");
  const dir = await mkdtemp(join(tmpdir(), "moviola-clip-"));
  const dest = join(dir, "cena.mp4");
  const order: string[] = [];
  try {
    const stored = await storeClip(scene, new Uint8Array([1, 2, 3]), dest, async (path, bytes) => {
      order.push("write");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path, bytes);
      order.push("written");
    });
    order.push(stored.status);
    expect(order).toEqual(["write", "written", "pronta"]);
    expect(stored.filePath).toBe(dest);
    expect(Array.from(await readFile(dest))).toEqual([1, 2, 3]);
    await expect(storeClip(scene, new Uint8Array([4]), dest, async () => {
      throw new Error("disco");
    })).rejects.toThrow("disco");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function listen(status: number, body: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((_req, res) => {
    res.writeHead(status);
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("porta");
      resolve({
        url: `http://127.0.0.1:${address.port}/clip`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

test("041 http 200 grava o arquivo e http 500 marca falhou", async () => {
  const session = createSession(
    { theme: "HTTP", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
    "2026-10-06T00:00:00.000Z",
  );
  const scene = session.scenes[0];
  if (!scene) throw new Error("sessão sem cena");
  const dir = await mkdtemp(join(tmpdir(), "moviola-http-"));
  const okServer = await listen(200, "mp4");
  const failServer = await listen(500, "erro");
  try {
    const saved = await requestClip(scene, okServer.url, fetch, join(dir, "ok.mp4"));
    expect(saved.status).toBe("pronta");
    expect(await readFile(join(dir, "ok.mp4"), "utf8")).toBe("mp4");
    const failed = await requestClip(scene, failServer.url, fetch, join(dir, "ruim.mp4"));
    expect(failed.status).toBe("falhou");
    expect(failed.reason).toBe("http 500");
    await expect(readFile(join(dir, "ruim.mp4"))).rejects.toThrow();
  } finally {
    await okServer.close();
    await failServer.close();
    await rm(dir, { recursive: true, force: true });
  }
});
