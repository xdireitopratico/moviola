import { expect, test } from "bun:test";
import { createSession } from "./contract.ts";
import { requestClip } from "./generate.ts";

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
