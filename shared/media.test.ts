import { expect, test } from "bun:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createSession } from "./contract.ts";
import { exportOutput, mediaUrl } from "./media.ts";

test("mediaUrl devolve file:// via pathToFileURL", () => {
  const absolute = join("/tmp", "sessao", "out.mp4");
  expect(mediaUrl(absolute)).toBe(pathToFileURL(absolute).href);
  expect(mediaUrl(absolute).startsWith("file://")).toBe(true);
});

test("export copia o mp4 ou devolve cancelado/sem_saida/arquivo_ausente", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moviola-export-"));
  const source = join(dir, "source.mp4");
  const dest = join(dir, "chosen.mp4");
  try {
    await writeFile(source, "mp4-bytes");
    const session = {
      ...createSession(
        { theme: "Export", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
        "2026-10-06T00:00:00.000Z",
      ),
      status: "done" as const,
      outputPath: source,
    };

    const missing = await exportOutput({ ...session, outputPath: null }, async () => dest);
    expect(missing).toEqual({ ok: false, reason: "sem_saida" });

    const absent = await exportOutput(
      { ...session, outputPath: join(dir, "sumiu.mp4") },
      async () => dest,
    );
    expect(absent).toEqual({ ok: false, reason: "arquivo_ausente" });

    const cancelled = await exportOutput(session, async () => null);
    expect(cancelled).toEqual({ ok: false, reason: "cancelado" });

    const copied = await exportOutput(session, async () => dest);
    expect(copied).toEqual({ ok: true, path: dest });
    expect(await readFile(dest, "utf8")).toBe("mp4-bytes");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});