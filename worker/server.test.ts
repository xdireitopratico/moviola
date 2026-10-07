import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession, type Scene, type Session } from "../shared/contract.ts";
import { applyColor, colorAdjustmentEnabled, colorClip, splitClip } from "./concat.ts";
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
    scale: 1,
    positionX: 0,
    positionY: 0,
    opacity: 1,
    kenBurns: { enabled: false, startScale: 1, endScale: 1.1 },
    colorBrightness: 0,
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
  const builtReq = viaDecide.body.request as Record<string, unknown>;
  expect(viaDecide.body.ok).toBe(true);
  expect(builtReq.clips).toEqual(["/clipes/inexistente-0.mp4", "/clipes/inexistente-1.mp4"]);
  expect(builtReq.narrationUrl).toBeNull();
  expect(builtReq.music).toBeNull();
  expect(builtReq.srt).toBeNull();
  expect(builtReq.textTracks).toEqual([]);
  expect(builtReq.outputFormat).toBe("mp4");
  expect(builtReq.callback).toBe("app://callback");
  expect(Array.isArray(builtReq.clipEffects)).toBe(true);

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


test("068 o worker aplica Ken Burns do pedido", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-kb-"));
  const clip = join(dir, "in.mp4");
  const server = await startPostProd(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta");
  try {
    await colorClip(clip, "red");
    const session = sessionWith([
      scene({
        id: "a",
        index: 0,
        status: "pronta",
        filePath: clip,
        kenBurns: { enabled: true, startScale: 1, endScale: 1.2 },
      }),
    ]);
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/post-production`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, callback: "app://callback" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(dir, { recursive: true, force: true });
  }
});

test("069 cor: o worker aplica um ajuste e a aba pode gravar", async () => {
  expect(colorAdjustmentEnabled).toBe(true);
  const dir = await mkdtemp(join(tmpdir(), "moviola-color-adj-"));
  const src = join(dir, "in.mp4");
  const dest = join(dir, "out.mp4");
  try {
    await colorClip(src, "blue");
    await applyColor(src, dest, 0.05);
    const bytes = await readFile(dest);
    expect(bytes.byteLength).toBeGreaterThan(100);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("071 a lâmina divide o clipe em dois trechos", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-split-"));
  const src = join(dir, "in.mp4");
  const left = join(dir, "left.mp4");
  const right = join(dir, "right.mp4");
  try {
    // 2s clip for a mid split
    const { spawn } = await import("node:child_process");
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", [
        "-y", "-f", "lavfi", "-i", "color=c=green:s=320x240:d=2", "-pix_fmt", "yuv420p", src,
      ], { stdio: ["ignore", "ignore", "pipe"] });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg"))));
    });
    await splitClip(src, 1, left, right);
    const leftProbe = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", left], {
      stdout: "pipe",
    });
    const rightProbe = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", right], {
      stdout: "pipe",
    });
    expect(Number(await new Response(leftProbe.stdout).text())).toBeGreaterThan(0.5);
    expect(Number(await new Response(rightProbe.stdout).text())).toBeGreaterThan(0.5);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
