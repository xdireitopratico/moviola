import type { Launch, Session } from "./contract.ts";
import { readSession, saveSession, withLaunch } from "./store.ts";

export const launchFields = ["theme", "durationSeconds", "aspectRatio", "style"] as const;

export function launchFrom(session: Session): Launch {
  return {
    theme: session.launch.theme,
    durationSeconds: session.launch.durationSeconds,
    aspectRatio: session.launch.aspectRatio,
    style: session.launch.style,
  };
}

export async function writeLaunch(root: string, id: string, launch: Launch, now: string): Promise<Session> {
  const current = await readSession(root, id);
  const next = withLaunch(
    current,
    {
      theme: launch.theme,
      durationSeconds: launch.durationSeconds,
      aspectRatio: launch.aspectRatio,
      style: launch.style,
    },
    now,
  );
  await saveSession(root, next);
  return next;
}
