import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeSceneText, type Launch, type Session } from "./contract.ts";

function fileOf(root: string, id: string): string {
  return join(root, `${id}.json`);
}

export async function saveSession(root: string, session: Session): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(fileOf(root, session.id), JSON.stringify(session), "utf8");
}

export async function readSession(root: string, id: string): Promise<Session> {
  const raw = await readFile(fileOf(root, id), "utf8");
  return JSON.parse(raw) as Session;
}

export async function listSessions(root: string): Promise<Session[]> {
  await mkdir(root, { recursive: true });
  const names = await readdir(root);
  const sessions: Session[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const raw = await readFile(join(root, name), "utf8");
    sessions.push(JSON.parse(raw) as Session);
  }
  return sessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function withLaunch(session: Session, launch: Launch, now: string): Session {
  const theme = launch.theme.trim();
  return {
    ...session,
    launch,
    projectName: theme || session.projectName,
    updatedAt: now,
  };
}

export function reorderScenes(session: Session, orderedIds: string[], now: string): Session {
  const byId = new Map(session.scenes.map((scene) => [scene.id, scene]));
  const scenes = orderedIds.map((id, index) => {
    const scene = byId.get(id);
    if (!scene) throw new Error(`cena ausente: ${id}`);
    return { ...scene, index };
  });
  return { ...session, scenes, updatedAt: now };
}

export function setNarration(session: Session, sceneId: string, narration: string, now: string): Session {
  return {
    ...session,
    updatedAt: now,
    scenes: session.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      return writeSceneText(scene, narration).scene;
    }),
  };
}

export function lockScene(session: Session, sceneId: string, now: string): Session {
  return {
    ...session,
    updatedAt: now,
    scenes: session.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, status: "travada" as const } : scene,
    ),
  };
}
