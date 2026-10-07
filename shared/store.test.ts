import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession, type Scene } from "./contract.ts";
import { listSessions, lockScene, readSession, reorderScenes, saveSession, setNarration, withLaunch } from "./store.ts";

const launch = {
  theme: "A história do café",
  durationSeconds: 60,
  aspectRatio: "16:9",
  style: "Documental",
};

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), "moviola-"));
}

describe("store", () => {
  test("013 cria e relê a sessão", async () => {
    const dir = await root();
    try {
      const session = createSession(launch, "2026-10-06T00:00:00.000Z");
      await saveSession(dir, session);
      expect(await readSession(dir, session.id)).toEqual(session);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("014 lista as recentes pela data", async () => {
    const dir = await root();
    try {
      const older = createSession(launch, "2026-10-01T00:00:00.000Z");
      const newer = createSession({ ...launch, theme: "Maré" }, "2026-10-06T00:00:00.000Z");
      await saveSession(dir, older);
      await saveSession(dir, newer);
      const listed = await listSessions(dir);
      expect(listed.map((session) => session.id)).toEqual([newer.id, older.id]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("015 grava tema, duração, formato e estilo", async () => {
    const dir = await root();
    try {
      const session = createSession(launch, "2026-10-06T00:00:00.000Z");
      const next = withLaunch(
        session,
        { theme: "Cerrado", durationSeconds: 30, aspectRatio: "9:16", style: "Editorial" },
        "2026-10-06T01:00:00.000Z",
      );
      await saveSession(dir, next);
      const read = await readSession(dir, session.id);
      expect(read.launch).toEqual(next.launch);
      expect(read.projectName).toBe("Cerrado");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("016 grava a nova ordem das cenas", async () => {
    const dir = await root();
    try {
      const session = createSession(launch, "2026-10-06T00:00:00.000Z");
      const extra: Scene = {
        id: "segunda",
        index: 1,
        title: "",
        narration: "",
        prompt: "",
        durationSeconds: 8,
        status: "vazia",
        filePath: null,
      };
      const first = session.scenes[0];
      if (!first) throw new Error("sessão sem cena");
      const reordered = reorderScenes(
        { ...session, scenes: [first, extra] },
        [extra.id, first.id],
        "2026-10-06T01:00:00.000Z",
      );
      await saveSession(dir, reordered);
      const read = await readSession(dir, session.id);
      expect(read.scenes.map((item) => item.id)).toEqual([extra.id, first.id]);
      expect(read.scenes.map((item) => item.index)).toEqual([0, 1]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("017 grava a narração editada", async () => {
    const dir = await root();
    try {
      const session = createSession(launch, "2026-10-06T00:00:00.000Z");
      const scene = session.scenes[0];
      if (!scene) throw new Error("sessão sem cena");
      const edited = setNarration(session, scene.id, "Em 1727 as mudas chegam.", "2026-10-06T01:00:00.000Z");
      await saveSession(dir, edited);
      const read = await readSession(dir, session.id);
      expect(read.scenes[0]?.narration).toBe("Em 1727 as mudas chegam.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("018 grava a trava e o texto aprovado permanece", async () => {
    const dir = await root();
    try {
      const session = createSession(launch, "2026-10-06T00:00:00.000Z");
      const scene = session.scenes[0];
      if (!scene) throw new Error("sessão sem cena");
      const written = setNarration(session, scene.id, "texto aprovado", "2026-10-06T01:00:00.000Z");
      const locked = lockScene(written, scene.id, "2026-10-06T02:00:00.000Z");
      const refused = setNarration(locked, scene.id, "texto novo", "2026-10-06T03:00:00.000Z");
      await saveSession(dir, refused);
      const read = await readSession(dir, session.id);
      expect(read.scenes[0]?.status).toBe("travada");
      expect(read.scenes[0]?.narration).toBe("texto aprovado");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
