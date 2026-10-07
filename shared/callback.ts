import { writeFile } from "node:fs/promises";
import type { Session } from "./contract.ts";

type WriteMp4 = (path: string, bytes: Uint8Array) => Promise<void>;

export type CallbackResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: string };

export async function applyCallback(
  session: Session,
  result: CallbackResult,
  destPath: string,
  now: string,
  write: WriteMp4 = writeFile,
): Promise<Session> {
  if (!result.ok) {
    return {
      ...session,
      status: "failed",
      outputPath: null,
      reason: result.reason,
      updatedAt: now,
    };
  }
  await write(destPath, result.bytes);
  return {
    ...session,
    status: "done",
    outputPath: destPath,
    reason: null,
    updatedAt: now,
  };
}
