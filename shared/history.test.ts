import { expect, test } from "bun:test";
import { createSession } from "./contract.ts";
import { createHistory, editClips, redo, undo } from "./history.ts";

test("076 desfazer e refazer uma edição de clipe", () => {
  const session = createSession(
    { theme: "Histórico", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
    "2026-10-06T00:00:00.000Z",
  );
  const first = session.scenes[0];
  if (!first) throw new Error("cena");
  let history = createHistory(session.scenes);
  const edited = [{ ...first, scale: 1.5, positionX: 10 }];
  history = editClips(history, edited);
  expect(history.present[0]?.scale).toBe(1.5);
  history = undo(history);
  expect(history.present[0]?.scale).toBe(1);
  expect(history.present[0]?.positionX).toBe(0);
  history = redo(history);
  expect(history.present[0]?.scale).toBe(1.5);
  expect(history.present[0]?.positionX).toBe(10);
});
