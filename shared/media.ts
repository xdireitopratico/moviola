import { access, copyFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { Session } from "./contract.ts";

export function mediaUrl(absolutePath: string): string {
  return pathToFileURL(absolutePath).href;
}

export type ExportResult =
  | { ok: true; path: string }
  | { ok: false; reason: "cancelado" | "sem_saida" | "arquivo_ausente" };

type ChoosePath = () => Promise<string | null>;
type CopyFile = (source: string, dest: string) => Promise<void>;
type AccessFile = (path: string) => Promise<void>;

export async function exportOutput(
  session: Session,
  choosePath: ChoosePath,
  copy: CopyFile = copyFile,
  probe: AccessFile = (path) => access(path).then(() => undefined),
): Promise<ExportResult> {
  if (!session.outputPath) {
    return { ok: false, reason: "sem_saida" };
  }
  try {
    await probe(session.outputPath);
  } catch {
    return { ok: false, reason: "arquivo_ausente" };
  }
  const dest = await choosePath();
  if (!dest) {
    return { ok: false, reason: "cancelado" };
  }
  await copy(session.outputPath, dest);
  return { ok: true, path: dest };
}