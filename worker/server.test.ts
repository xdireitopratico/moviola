import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession, type Scene, type Session } from "../shared/contract.ts";
import { colorClip } from "./concat.ts";
import { decide, startPostProd } from "./server.ts";

const launch = {
  theme: "Portão",
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
    ...patch,
  };
}

function sessionWith(scenes: Scene[]): Session {
  const session = createSession(launch, "2026-10-06T00:00:00.000Z");
  return { ...session, scenes };
}

test("042 POST /api/v1/post-production responde na porta", async () => {
  const server = await startPostProd(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/post-production`, { method: "POST" });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("043 o worker recusa cena incompleta e clipe sem arquivo", async () => {
  const open = scene({ id: "aberta", index: 1, status: "vazia" });
  const done = scene({ id: "feita", index: 0, status: "pronta", filePath: "/clipes/0.mp4" });
  const incomplete = await decide(
    "POST",
    "/api/v1/post-production",
    JSON.stringify({ session: sessionWith([open, done]), callback: "https://app.local/callback" }),
  );
  expect(incomplete.status).toBe(409);
  expect(incomplete.body).toEqual({ ok: false, sceneId: "aberta", sceneIndex: 1, reason: "incompleta" });
  expect(incomplete.body).not.toHaveProperty("request");

  const first = scene({ id: "a", index: 0, status: "pronta", filePath: "/clipes/0.mp4" });
  const second = scene({ id: "b", index: 1, status: "pronta", filePath: null });
  const missing = await decide(
    "POST",
    "/api/v1/post-production",
    JSON.stringify({ session: sessionWith([first, second]), callback: "https://app.local/callback" }),
  );
  expect(missing.status).toBe(409);
  expect(missing.body).toEqual({ ok: false, sceneId: "b", sceneIndex: 1, reason: "sem_arquivo" });
  expect(missing.body).not.toHaveProperty("request");
});

test("044 o worker concatena dois clipes de cor e devolve um mp4", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-color-"));
  const red = join(dir, "red.mp4");
  const blue = join(dir, "blue.mp4");
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
      body: JSON.stringify({ session, callback: "https://app.local/callback" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(100);
    const out = join(dir, "out.mp4");
    await writeFile(out, bytes);
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

test("048 dry_run devolve o pedido e não chama o ffmpeg", async () => {
  const session = sessionWith([
    scene({ id: "a", index: 0, status: "pronta", filePath: "/clipes/inexistente-0.mp4" }),
    scene({ id: "b", index: 1, status: "pronta", filePath: "/clipes/inexistente-1.mp4" }),
  ]);
  const viaDecide = await decide(
    "POST",
    "/api/v1/post-production",
    JSON.stringify({ session, callback: "app://callback", dry_run: true }),
  );
  expect(viaDecide.status).toBe(200);
  expect(viaDecide.clips).toBeUndefined();
  expect(viaDecide.body).toEqual({
    ok: true,
    request: {
      sessionId: session.id,
      projectName: session.projectName,
      clips: ["/clipes/inexistente-0.mp4", "/clipes/inexistente-1.mp4"],
      narrationUrl: null,
      outputFormat: "mp4",
      callback: "app://callback",
    },
  });

  const server = await startPostProd(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/post-production`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, callback: "app://callback", dry_run: true }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body).toEqual(viaDecide.body);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
