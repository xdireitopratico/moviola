import { describe, expect, test } from "bun:test";
import {
  buildPostProdRequest,
  createSession,
  defaultVoice,
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


describe("054 contrato de voz", () => {
  test("sessão nova traz id, velocidade e pausa entre cenas", () => {
    const session = createSession(launch, "2026-10-06T00:00:00.000Z");
    expect(session.voice).toEqual(defaultVoice());
    expect(session.voice).toEqual({ id: "", speed: 1, pauseBetweenScenesSeconds: 0 });
    const edited = {
      ...session,
      voice: { id: "pt-br-clara", speed: 1.1, pauseBetweenScenesSeconds: 0.4 },
    };
    expect(edited.voice.id).toBe("pt-br-clara");
    expect(edited.voice.speed).toBe(1.1);
    expect(edited.voice.pauseBetweenScenesSeconds).toBe(0.4);
  });
});

describe("060 música no pedido", () => {
  test("com música ligada o pedido leva arquivo, volume e fades", () => {
    const scenes = [
      scene({ id: "a", index: 0, status: "pronta", filePath: "/clipes/0.mp4", reason: null }),
      scene({ id: "b", index: 1, status: "pronta", filePath: "/clipes/1.mp4", reason: null }),
    ];
    const base = sessionWith(scenes);
    const withMusic = {
      ...base,
      music: {
        enabled: true,
        filePath: "/trilha/tema.mp3",
        volume: 0.25,
        fadeInSeconds: 1.5,
        fadeOutSeconds: 2,
      },
    };
    const built = buildPostProdRequest(withMusic, "https://app.local/callback");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.music).toEqual({
      filePath: "/trilha/tema.mp3",
      volume: 0.25,
      fadeInSeconds: 1.5,
      fadeOutSeconds: 2,
    });
  });

  test("com música desligada o pedido leva music null", () => {
    const scenes = [scene({ id: "a", index: 0, status: "pronta", filePath: "/clipes/0.mp4", reason: null })];
    const built = buildPostProdRequest(sessionWith(scenes), "https://app.local/callback");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.music).toBeNull();
  });
});


describe("066 escala posição opacidade", () => {
  test("cena nova traz escala 1, posição 0 e opacidade 1", () => {
    const session = createSession(launch, "2026-10-06T00:00:00.000Z");
    const scene = session.scenes[0];
    expect(scene?.scale).toBe(1);
    expect(scene?.positionX).toBe(0);
    expect(scene?.positionY).toBe(0);
    expect(scene?.opacity).toBe(1);
  });
});

describe("073 faixa de texto no pedido", () => {
  test("o pedido leva as faixas de texto da sessão", () => {
    const scenes = [scene({ id: "a", index: 0, status: "pronta", filePath: "/clipes/0.mp4", reason: null })];
    const base = sessionWith(scenes);
    const withText = {
      ...base,
      textTracks: [{ id: "t1", text: "Olá", startSeconds: 0, endSeconds: 2, locked: false }],
    };
    const built = buildPostProdRequest(withText, "https://app.local/callback");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.textTracks).toEqual([{ id: "t1", text: "Olá", startSeconds: 0, endSeconds: 2, locked: false }]);
  });
});


describe("056 narração no pedido", () => {
  test("com narrationUrl o pedido leva a narração", () => {
    const scenes = [scene({ id: "a", index: 0, status: "pronta", filePath: "/clipes/0.mp4" })];
    const base = sessionWith(scenes);
    const withNarration = { ...base, narrationUrl: "/audio/voz.wav" };
    const built = buildPostProdRequest(withNarration, "https://app.local/callback");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.narrationUrl).toBe("/audio/voz.wav");
  });
});

describe("059 legenda no pedido", () => {
  test("com legenda ligada o pedido leva o SRT", () => {
    const scenes = [scene({ id: "a", index: 0, status: "pronta", filePath: "/clipes/0.mp4" })];
    const base = sessionWith(scenes);
    const withCaps = {
      ...base,
      captions: { enabled: true, srt: "1\n00:00:00,000 --> 00:00:01,000\nOlá" },
    };
    const built = buildPostProdRequest(withCaps, "https://app.local/callback");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.srt).toContain("Olá");
  });

  test("com legenda desligada o pedido leva srt null", () => {
    const scenes = [scene({ id: "a", index: 0, status: "pronta", filePath: "/clipes/0.mp4" })];
    const built = buildPostProdRequest(sessionWith(scenes), "https://app.local/callback");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.srt).toBeNull();
  });
});

describe("068 Ken Burns no pedido", () => {
  test("ken burns da cena entra em clipEffects", () => {
    const scenes = [
      scene({
        id: "a",
        index: 0,
        status: "pronta",
        filePath: "/clipes/0.mp4",
        kenBurns: { enabled: true, startScale: 1, endScale: 1.3 },
      }),
    ];
    const built = buildPostProdRequest(sessionWith(scenes), "https://app.local/callback");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.clipEffects[0]?.kenBurns).toEqual({ enabled: true, startScale: 1, endScale: 1.3 });
  });
});

describe("075 faixa travada", () => {
  test("faixa travada não entra no render seguinte", () => {
    const scenes = [scene({ id: "a", index: 0, status: "pronta", filePath: "/clipes/0.mp4" })];
    const base = sessionWith(scenes);
    const withTracks = {
      ...base,
      textTracks: [
        { id: "t1", text: "livre", startSeconds: 0, endSeconds: 1, locked: false },
        { id: "t2", text: "travada", startSeconds: 1, endSeconds: 2, locked: true },
      ],
    };
    const built = buildPostProdRequest(withTracks, "https://app.local/callback");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.textTracks).toEqual([
      { id: "t1", text: "livre", startSeconds: 0, endSeconds: 1, locked: false },
    ]);
  });
});

describe("081 marca vazia", () => {
  test("sessão nova começa com marca vazia", () => {
    const session = createSession(launch, "2026-10-06T00:00:00.000Z");
    expect(session.brand).toBe("");
  });
});
