import { expect, test } from "bun:test";
import { createSession, type Scene } from "./contract.ts";
import { requestClip, runQueue } from "./generate.ts";

test("038 sem url a cena fica falhou com motivo", async () => {
  const session = createSession(
    { theme: "Geração", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
    "2026-10-06T00:00:00.000Z",
  );
  const scene = session.scenes[0];
  if (!scene) throw new Error("sessão sem cena");
  const failed = await requestClip(scene, null);
  expect(failed.status).toBe("falhou");
  expect(failed.reason).toBe("sem url");
  expect(failed.filePath).toBeNull();
});

test("039 a fila trata uma cena por vez e ela entra gerando", async () => {
  const session = createSession(
    { theme: "Fila", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
    "2026-10-06T00:00:00.000Z",
  );
  const first = session.scenes[0];
  if (!first) throw new Error("sessão sem cena");
  const second: Scene = { ...first, id: "cena-2", index: 1, title: "Segunda" };
  let busy = 0;
  let max = 0;
  const seen: string[] = [];
  const done = await runQueue([second, first], async (scene) => {
    busy += 1;
    max = Math.max(max, busy);
    seen.push(scene.status);
    await Promise.resolve();
    busy -= 1;
    return { ...scene, status: "falhou", reason: "fim" };
  });
  expect(max).toBe(1);
  expect(seen).toEqual(["gerando", "gerando"]);
  expect(done.map((scene) => scene.id)).toEqual([first.id, "cena-2"]);
  expect(done.every((scene) => scene.status === "falhou")).toBe(true);
});
