import { describe, expect, test } from "bun:test";
import {
  buildPostProdRequest,
  createSession,
  parseSceneStatus,
  writeSceneText,
  type Scene,
  type Session,
} from "./contract.ts";

const launch = {
  theme: "A história do café",
  durationSeconds: 60,
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
    ...patch,
  };
}

function sessionWith(scenes: Scene[]): Session {
  const session = createSession(launch, "2026-10-06T00:00:00.000Z");
  return { ...session, scenes };
}

describe("007 sessão nova", () => {
  test("nasce em briefing com a cena solta", () => {
    const session = createSession(launch, "2026-10-06T00:00:00.000Z");
    expect(session.status).toBe("briefing");
    expect(session.launch).toEqual(launch);
    expect(session.scenes).toHaveLength(1);
    expect(session.scenes[0]?.status).toBe("vazia");
  });
});

describe("008 estado da cena", () => {
  test("rejeita estado fora dos cinco", () => {
    expect(() => parseSceneStatus("exportada")).toThrow(/inválido/);
    expect(parseSceneStatus("travada")).toBe("travada");
  });
});

describe("009 texto travado", () => {
  test("não sobrescreve a narração", () => {
    const locked = scene({ id: "c1", index: 0, status: "travada", narration: "texto aprovado" });
    const written = writeSceneText(locked, "texto novo");
    expect(written.ok).toBe(false);
    expect(written.scene.narration).toBe("texto aprovado");
  });
});

describe("010 a 012 pós-produção", () => {
  test("aponta a cena incompleta e não monta o pedido", () => {
    const open = scene({ id: "aberta", index: 1, status: "vazia" });
    const done = scene({ id: "feita", index: 0, status: "pronta", filePath: "/clipes/0.mp4" });
    const built = buildPostProdRequest(sessionWith([open, done]), "https://app.local/callback");
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.sceneId).toBe("aberta");
    expect(built.sceneIndex).toBe(1);
    expect(built.reason).toBe("incompleta");
  });

  test("recusa clipe pronto sem arquivo", () => {
    const first = scene({ id: "a", index: 0, status: "pronta", filePath: "/clipes/0.mp4" });
    const second = scene({ id: "b", index: 1, status: "pronta", filePath: null });
    const built = buildPostProdRequest(sessionWith([first, second]), "https://app.local/callback");
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.sceneId).toBe("b");
    expect(built.reason).toBe("sem_arquivo");
  });

  test("monta o pedido em ordem, mp4, com callback", () => {
    const scenes = [
      scene({ id: "c", index: 2, status: "pronta", filePath: "/clipes/2.mp4" }),
      scene({ id: "a", index: 0, status: "pronta", filePath: "/clipes/0.mp4" }),
      scene({ id: "b", index: 1, status: "pronta", filePath: "/clipes/1.mp4" }),
    ];
    const built = buildPostProdRequest(sessionWith(scenes), "https://app.local/callback");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.clips).toEqual(["/clipes/0.mp4", "/clipes/1.mp4", "/clipes/2.mp4"]);
    expect(built.request.outputFormat).toBe("mp4");
    expect(built.request.callback).toBe("https://app.local/callback");
  });
});
