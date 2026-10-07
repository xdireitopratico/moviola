import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPostProdRequest, type Session } from "../shared/contract.ts";
import { concatClips, renderClipEffects } from "./concat.ts";
import type { ClipRequest } from "../shared/contract.ts";

export async function decide(
  method: string,
  path: string,
  raw: string,
): Promise<{ status: number; body: Record<string, unknown>; clips?: string[]; effects?: ClipRequest[] }> {
  if (method !== "POST" || path !== "/api/v1/post-production") {
    return { status: 404, body: { error: "não encontrado" } };
  }
  let payload: { session?: Session; callback?: string; dry_run?: boolean };
  try {
    payload = raw ? (JSON.parse(raw) as { session?: Session; callback?: string; dry_run?: boolean }) : {};
  } catch {
    return { status: 400, body: { error: "json inválido" } };
  }
  if (!payload.session || !payload.callback) {
    return { status: 202, body: { accepted: true } };
  }
  const built = buildPostProdRequest(payload.session, payload.callback);
  if (!built.ok) {
    return {
      status: 409,
      body: { ok: false, sceneId: built.sceneId, sceneIndex: built.sceneIndex, reason: built.reason },
    };
  }
  if (payload.dry_run) {
    return { status: 200, body: { ok: true, request: built.request } };
  }
  return {
    status: 200,
    body: { accepted: true },
    clips: built.request.clips,
    effects: built.request.clipEffects,
  };
}

export async function renderClips(clips: string[]): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "moviola-out-"));
  const dest = join(dir, "out.mp4");
  await concatClips(clips, dest);
  return readFile(dest);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function startPostProd(port: number, hostname = "127.0.0.1"): Promise<Server> {
  const server = createServer((req, res) => {
    void readBody(req).then(async (raw) => {
      const result = await decide(req.method ?? "GET", new URL(req.url ?? "/", "http://127.0.0.1").pathname, raw);
      if (result.effects && result.effects.some((fx) => fx.kenBurns.enabled || fx.colorBrightness !== 0)) {
        const dir = await mkdtemp(join(tmpdir(), "moviola-out-"));
        const dest = join(dir, "out.mp4");
        await renderClipEffects(result.effects, dest);
        const mp4 = await readFile(dest);
        res.writeHead(200, { "content-type": "video/mp4", "content-length": String(mp4.length) });
        res.end(mp4);
        return;
      }
      if (result.clips) {
        const mp4 = await renderClips(result.clips);
        res.writeHead(200, { "content-type": "video/mp4", "content-length": String(mp4.length) });
        res.end(mp4);
        return;
      }
      res.writeHead(result.status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result.body));
    });
  });
  return new Promise((resolve) => {
    server.listen(port, hostname, () => resolve(server));
  });
}

const entry = process.argv[1] ?? "";
const invoked = entry.endsWith("worker/server.ts") || entry.endsWith("worker/server.js");
if (invoked) {
  const port = Number(process.env.MOVIOLA_POSTPROD_PORT ?? 8085);
  startPostProd(port).then(() => {
    console.log(`MOVIOLA_POSTPROD ${port}`);
  });
}