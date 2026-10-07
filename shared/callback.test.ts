import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession, type Scene, type Session } from "./contract.ts";
import { applyCallback } from "./callback.ts";
import { saveSession, readSession } from "./store.ts";
import { colorClip } from "../worker/concat.ts";
import { startPostProd } from "../worker/server.ts";

const launch = {
  theme: "Callback",
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
  const session = createSession(launch, "2026-10-06T00:00:00.000Z");
  return { ...session, scenes };
}

test("045 o callback grava o mp4 e marca a sessão done", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-045-"));
  const red = join(dir, "red.mp4");
  const blue = join(dir, "blue.mp4");
  const out = join(dir, "final.mp4");
  const sessions = join(dir, "sessions");
  const server = await startPostProd(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta");
  try {
    await colorClip(red, "red");
    await colorClip(blue, "blue");
    const session = sessionWith([
      scene({ id: "a", index: 0, status: "pronta", filePath: red }),
      scene({ id: "b", index: 1, status: "pronta", filePath: blue }),
    ]);
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/post-production`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, callback: "app://callback" }),
    });
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(100);

    const order: string[] = [];
    const applied = await applyCallback(
      session,
      { ok: true, bytes },
      out,
      "2026-10-06T02:00:00.000Z",
      async (path, data) => {
        order.push("write");
        const { writeFile } = await import("node:fs/promises");
        await writeFile(path, data);
        order.push("written");
      },
    );
    order.push(applied.status);
    expect(order).toEqual(["write", "written", "done"]);
    expect(applied.status).toBe("done");
    expect(applied.outputPath).toBe(out);
    expect(applied.reason).toBeNull();
    await access(out);
    await saveSession(sessions, applied);
    const stored = await readSession(sessions, session.id);
    expect(stored.status).toBe("done");
    expect(stored.outputPath).toBe(out);
    expect((await readFile(out)).byteLength).toBe(bytes.byteLength);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(dir, { recursive: true, force: true });
  }
});

test("045 o callback marca a sessão failed sem gravar mp4", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-045f-"));
  const out = join(dir, "final.mp4");
  const sessions = join(dir, "sessions");
  try {
    const session = createSession(launch, "2026-10-06T00:00:00.000Z");
    let wrote = false;
    const applied = await applyCallback(
      session,
      { ok: false, reason: "ffmpeg falhou" },
      out,
      "2026-10-06T03:00:00.000Z",
      async () => {
        wrote = true;
      },
    );
    expect(wrote).toBe(false);
    expect(applied.status).toBe("failed");
    expect(applied.outputPath).toBeNull();
    expect(applied.reason).toBe("ffmpeg falhou");
    await saveSession(sessions, applied);
    const stored = await readSession(sessions, session.id);
    expect(stored.status).toBe("failed");
    expect(stored.reason).toBe("ffmpeg falhou");
    await expect(readFile(out)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("046 worker com arquivo real sem resposta forjada deixa a sessão done", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-046-"));
  const red = join(dir, "red.mp4");
  const blue = join(dir, "blue.mp4");
  const out = join(dir, "final.mp4");
  const sessions = join(dir, "sessions");
  const server = await startPostProd(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta");
  try {
    await colorClip(red, "red");
    await colorClip(blue, "blue");
    const session = sessionWith([
      scene({ id: "a", index: 0, status: "pronta", filePath: red }),
      scene({ id: "b", index: 1, status: "pronta", filePath: blue }),
    ]);
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/post-production`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, callback: "app://callback" }),
    });
    expect(response.headers.get("content-type")).toBe("video/mp4");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const applied = await applyCallback(session, { ok: true, bytes }, out, "2026-10-06T04:00:00.000Z");
    await saveSession(sessions, applied);
    const stored = await readSession(sessions, session.id);
    expect(stored.status).toBe("done");
    expect(stored.outputPath).toBe(out);
    const probe = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], {
      stdout: "pipe",
    });
    const duration = Number(await new Response(probe.stdout).text());
    expect(duration).toBeGreaterThan(1.5);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(dir, { recursive: true, force: true });
  }
});