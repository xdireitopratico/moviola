import { mkdtemp, rm, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession } from "../shared/contract.ts";
import { fillStoryboard } from "../shared/operations.ts";
import { saveSession, readSession } from "../shared/store.ts";
import { storeClip } from "../shared/generate.ts";
import { renderLocal } from "../shared/postprod.ts";
import { exportOutput } from "../shared/media.ts";
import { colorClip } from "../worker/concat.ts";

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "moviola-e2e-053-"));
  const sessions = join(dir, "sessions");
  const media = join(dir, "media");
  const exportPath = join(dir, "exportado.mp4");
  try {
    const theme = "Viagem de barco";
    let session = createSession(
      { theme, durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
      new Date().toISOString(),
    );
    session = fillStoryboard(session, new Date().toISOString());
    await saveSession(sessions, session);

    const clipsDir = join(media, session.id);
    await writeFile(join(clipsDir, ".keep"), "").catch(async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(clipsDir, { recursive: true });
      await writeFile(join(clipsDir, ".keep"), "");
    });
    const { mkdir } = await import("node:fs/promises");
    await mkdir(clipsDir, { recursive: true });

    const colors = ["red", "green", "blue", "yellow"] as const;
    const scenes = [];
    for (let i = 0; i < session.scenes.length; i += 1) {
      const scene = session.scenes[i];
      if (!scene) throw new Error("cena");
      const clip = join(clipsDir, `${i}.mp4`);
      await colorClip(clip, colors[i % colors.length] ?? "red");
      const ready = await storeClip(scene, new Uint8Array(await readFile(clip)), clip);
      scenes.push(ready);
    }
    session = { ...session, scenes, updatedAt: new Date().toISOString() };
    await saveSession(sessions, session);

    const out = join(clipsDir, "final.mp4");
    session = await renderLocal(session, out, new Date().toISOString());
    if (session.status !== "done" || !session.outputPath) {
      throw new Error(`render falhou: ${session.status} ${session.reason}`);
    }
    await saveSession(sessions, session);
    await access(session.outputPath);

    const exported = await exportOutput(session, async () => exportPath);
    if (!exported.ok) throw new Error(`export falhou: ${exported.reason}`);
    await access(exported.path);
    const bytes = await readFile(exported.path);
    if (bytes.byteLength < 100) throw new Error("export vazio");

    const stored = await readSession(sessions, session.id);
    if (stored.projectName !== theme) throw new Error("tema");
    if (stored.status !== "done") throw new Error("status");
    if (stored.scenes.length < 2) throw new Error("cenas");
    if (!stored.scenes.every((s) => s.status === "pronta" && s.filePath)) throw new Error("clipes");

    console.log("E2E_053_OK", stored.id, exported.path, bytes.byteLength);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("E2E_053_FAIL", error);
  process.exit(1);
});
