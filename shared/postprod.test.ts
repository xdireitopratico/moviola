import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession, type Scene, type Session } from "./contract.ts";
import { callWorker, renderLocal, renderSession } from "./postprod.ts";
import { saveSession, readSession } from "./store.ts";
import { colorClip } from "../worker/concat.ts";
import { startPostProd } from "../worker/server.ts";

const launch = {
  theme: "Render",
  durationSeconds: 30,
  aspectRatio: "16:9",
  style: "Documental",
};

function scene(patch: Partial<Scene> & Pick<Scene, "id" | "index" | "status">): Scene {
  return {
    title: "",
    narration: "",
    prompt: "",
    durationSeconds: 8,
    filePath: null,
    reason: null,
    scale: 1,
    positionX: 0,
    positionY: 0,
    opacity: 1,
    kenBurns: { enabled: false, startScale: 1, endScale: 1.1 },
    colorBrightness: 0,
    translation: null,
    score: null,
    ...patch,
  };
}

function sessionWith(scenes: Scene[]): Session {
  return { ...createSession(launch, "2026-10-06T00:00:00.000Z"), scenes };
}

test("047 o app chama o worker e espera done", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-047-"));
  const red = join(dir, "red.mp4");
  const blue = join(dir, "blue.mp4");
  const out = join(dir, "final.mp4");
  const sessions = join(dir, "sessions");
  const server = await startPostProd(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta");
  const url = `http://127.0.0.1:${address.port}/api/v1/post-production`;
  try {
    await colorClip(red, "red");
    await colorClip(blue, "blue");
    const session = sessionWith([
      scene({ id: "a", index: 0, status: "pronta", filePath: red }),
      scene({ id: "b", index: 1, status: "pronta", filePath: blue }),
    ]);
    const rendered = await callWorker(session, url, out, "2026-10-06T05:00:00.000Z");
    expect(rendered.status).toBe("done");
    expect(rendered.outputPath).toBe(out);
    expect(rendered.reason).toBeNull();
    await saveSession(sessions, rendered);
    const stored = await readSession(sessions, session.id);
    expect(stored.status).toBe("done");
    expect((await readFile(out)).byteLength).toBeGreaterThan(100);
    const probe = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], {
      stdout: "pipe",
    });
    expect(Number(await new Response(probe.stdout).text())).toBeGreaterThan(1.5);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(dir, { recursive: true, force: true });
  }
});

test("047 sem url o app espera failed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-047u-"));
  try {
    const session = createSession(launch, "2026-10-06T00:00:00.000Z");
    const rendered = await callWorker(session, null, join(dir, "x.mp4"), "2026-10-06T05:01:00.000Z");
    expect(rendered.status).toBe("failed");
    expect(rendered.reason).toBe("sem url");
    expect(rendered.outputPath).toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("047 http erro o app espera failed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-047e-"));
  const red = join(dir, "red.mp4");
  const blue = join(dir, "blue.mp4");
  const server = createServer((_req, res) => {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "boom" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta");
  try {
    await colorClip(red, "red");
    await colorClip(blue, "blue");
    const session = sessionWith([
      scene({ id: "a", index: 0, status: "pronta", filePath: red }),
      scene({ id: "b", index: 1, status: "pronta", filePath: blue }),
    ]);
    const rendered = await callWorker(
      session,
      `http://127.0.0.1:${address.port}/api/v1/post-production`,
      join(dir, "out.mp4"),
      "2026-10-06T05:02:00.000Z",
    );
    expect(rendered.status).toBe("failed");
    expect(rendered.reason).toBe("http 500");
    expect(rendered.outputPath).toBeNull();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("047 portão incompleto marca failed sem chamar o worker", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-047g-"));
  let fetched = false;
  try {
    const session = sessionWith([scene({ id: "aberta", index: 0, status: "vazia" })]);
    const rendered = await callWorker(
      session,
      "http://127.0.0.1:9/api/v1/post-production",
      join(dir, "out.mp4"),
      "2026-10-06T05:03:00.000Z",
      async () => {
        fetched = true;
        throw new Error("não deveria fetch");
      },
    );
    expect(fetched).toBe(false);
    expect(rendered.status).toBe("failed");
    expect(rendered.reason).toBe("incompleta");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("063 com ffmpeg local o mesmo pedido roda na máquina", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-063-"));
  const red = join(dir, "red.mp4");
  const blue = join(dir, "blue.mp4");
  const out = join(dir, "final.mp4");
  try {
    await colorClip(red, "red");
    await colorClip(blue, "blue");
    const session = sessionWith([
      scene({ id: "a", index: 0, status: "pronta", filePath: red }),
      scene({ id: "b", index: 1, status: "pronta", filePath: blue }),
    ]);
    const rendered = await renderLocal(session, out, "2026-10-06T06:00:00.000Z");
    expect(rendered.status).toBe("done");
    expect(rendered.outputPath).toBe(out);
    const probe = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], {
      stdout: "pipe",
    });
    expect(Number(await new Response(probe.stdout).text())).toBeGreaterThan(1.5);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("064 com ffmpeg local renderSession não chama a VPS", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-064l-"));
  const red = join(dir, "red.mp4");
  const blue = join(dir, "blue.mp4");
  const out = join(dir, "final.mp4");
  let fetched = false;
  try {
    await colorClip(red, "red");
    await colorClip(blue, "blue");
    const session = sessionWith([
      scene({ id: "a", index: 0, status: "pronta", filePath: red }),
      scene({ id: "b", index: 1, status: "pronta", filePath: blue }),
    ]);
    const rendered = await renderSession(session, out, "2026-10-06T06:01:00.000Z", {
      probe: async () => ({ found: true, path: "/usr/bin/ffmpeg", version: "6" }),
      workerUrl: "http://127.0.0.1:9/api/v1/post-production",
      fetchImpl: async () => {
        fetched = true;
        throw new Error("não deveria VPS");
      },
    });
    expect(fetched).toBe(false);
    expect(rendered.status).toBe("done");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("064 sem ffmpeg local o mesmo pedido vai para a VPS", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-064v-"));
  const red = join(dir, "red.mp4");
  const blue = join(dir, "blue.mp4");
  const out = join(dir, "final.mp4");
  const server = await startPostProd(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta");
  const url = `http://127.0.0.1:${address.port}/api/v1/post-production`;
  try {
    await colorClip(red, "red");
    await colorClip(blue, "blue");
    const session = sessionWith([
      scene({ id: "a", index: 0, status: "pronta", filePath: red }),
      scene({ id: "b", index: 1, status: "pronta", filePath: blue }),
    ]);
    const rendered = await renderSession(session, out, "2026-10-06T06:02:00.000Z", {
      probe: async () => ({ found: false, path: null, version: null }),
      workerUrl: url,
    });
    expect(rendered.status).toBe("done");
    expect(rendered.outputPath).toBe(out);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(dir, { recursive: true, force: true });
  }
});
