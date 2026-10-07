import { expect, test } from "bun:test";
import { createSession, type Scene, type Session } from "../shared/contract.ts";
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
