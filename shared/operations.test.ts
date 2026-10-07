import { expect, test } from "bun:test";
import { createSession } from "./contract.ts";
import { createSession as createFromOps, fillStoryboard, openSession, regenerateScene, storyboard } from "./operations.ts";

const launch = {
  theme: "A história do café",
  durationSeconds: 60,
  aspectRatio: "16:9",
  style: "Documental",
};

test("027 createSession da operação é a única função de criação", () => {
  expect(createFromOps).toBe(createSession);
  const opened = openSession(launch, "2026-10-06T00:00:00.000Z");
  expect(opened.session.status).toBe("briefing");
  expect(opened.event.operation).toBe("createSession");
});

test("028 fillStoryboard escreve cenas a partir do tema, sem rede", async () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    throw new Error("rede");
  }) as typeof fetch;
  try {
    const session = createSession(launch, "2026-10-06T00:00:00.000Z");
    const filled = fillStoryboard(session, "2026-10-06T01:00:00.000Z");
    expect(filled.scenes.length).toBe(4);
    expect(filled.scenes[0]?.narration).toContain("A história do café");
    expect(filled.scenes.every((scene) => scene.status === "vazia" && scene.filePath === null)).toBe(true);
    expect(calls).toEqual([]);
  } finally {
    globalThis.fetch = original;
  }
});

test("029 fillStoryboard não altera cena travada", () => {
  const session = createSession(launch, "2026-10-06T00:00:00.000Z");
  const first = session.scenes[0];
  if (!first) throw new Error("sessão sem cena");
  const locked = {
    ...session,
    scenes: [{ ...first, index: 0, status: "travada" as const, narration: "texto aprovado" }],
  };
  const filled = fillStoryboard(locked, "2026-10-06T01:00:00.000Z");
  expect(filled.scenes[0]?.narration).toBe("texto aprovado");
  expect(filled.scenes[0]?.status).toBe("travada");
});

test("035 regenerar marca gerando e não deixa a cena pronta", () => {
  const session = createSession(launch, "2026-10-06T00:00:00.000Z");
  const scene = session.scenes[0];
  if (!scene) throw new Error("sessão sem cena");
  const next = regenerateScene(session, scene.id, "2026-10-06T01:00:00.000Z");
  expect(next.event.operation).toBe("regenerateScene");
  expect(next.session.scenes[0]?.status).toBe("gerando");
  expect(next.session.scenes[0]?.filePath).toBeNull();
});

test("030 cada operação acrescenta um evento", () => {
  const opened = openSession(launch, "2026-10-06T00:00:00.000Z");
  const filled = storyboard(opened.session, "2026-10-06T01:00:00.000Z");
  expect(opened.event.operation).toBe("createSession");
  expect(opened.session.lastEvent).toEqual(opened.event);
  expect(filled.event.operation).toBe("fillStoryboard");
  expect(filled.session.lastEvent).toEqual(filled.event);
  expect(filled.event.sessionId).toBe(opened.session.id);
});
