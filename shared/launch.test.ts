import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession } from "./contract.ts";
import { launchFields, launchFrom, writeLaunch } from "./launch.ts";
import { readSession, saveSession } from "./store.ts";

const launch = {
  theme: "Tema salvo",
  durationSeconds: 30,
  aspectRatio: "9:16",
  style: "Animação",
};

test("024 o preenchido grava e relê só o contrato", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-launch-"));
  try {
    const session = createSession(
      { theme: "Rascunho", durationSeconds: 60, aspectRatio: "16:9", style: "Documental" },
      "2026-10-06T00:00:00.000Z",
    );
    await saveSession(dir, session);
    const written = await writeLaunch(dir, session.id, { ...launch, extra: "não entra" } as typeof launch, "2026-10-06T01:00:00.000Z");
    const read = launchFrom(await readSession(dir, session.id));
    expect(written.launch).toEqual(launch);
    expect(read).toEqual(launch);
    expect(Object.keys(read).sort()).toEqual([...launchFields].sort());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
