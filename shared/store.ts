import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeSceneText, type Launch, type Session, type Scene, type VoiceSettings, type TextTrack, type MusicSettings, type CaptionsSettings } from "./contract.ts";

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

export function setVoice(session: Session, voice: VoiceSettings, now: string): Session {
  return {
    ...session,
    voice: {
      id: String(voice.id ?? ""),
      speed: Number(voice.speed),
      pauseBetweenScenesSeconds: Number(voice.pauseBetweenScenesSeconds),
    },
    updatedAt: now,
  };
}

export function setSceneTransform(
  session: Session,
  sceneId: string,
  transform: { scale: number; positionX: number; positionY: number; opacity: number },
  now: string,
): Session {
  return {
    ...session,
    updatedAt: now,
    scenes: session.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      return {
        ...scene,
        scale: Number(transform.scale),
        positionX: Number(transform.positionX),
        positionY: Number(transform.positionY),
        opacity: Number(transform.opacity),
      };
    }),
  };
}

export function setTextTracks(session: Session, textTracks: TextTrack[], now: string): Session {
  return {
    ...session,
    textTracks: textTracks.map((track) => ({
      id: String(track.id),
      text: String(track.text ?? ""),
      startSeconds: Number(track.startSeconds),
      endSeconds: Number(track.endSeconds),
      locked: Boolean(track.locked),
    })),
    updatedAt: now,
  };
}

export function setCaptions(session: Session, captions: CaptionsSettings, now: string): Session {
  return {
    ...session,
    captions: {
      enabled: Boolean(captions.enabled),
      srt: captions.srt == null ? null : String(captions.srt),
    },
    updatedAt: now,
  };
}

export function setMusic(session: Session, music: MusicSettings, now: string): Session {
  return {
    ...session,
    music: {
      enabled: Boolean(music.enabled),
      filePath: music.filePath == null || music.filePath === "" ? null : String(music.filePath),
      volume: Number(music.volume),
      fadeInSeconds: Number(music.fadeInSeconds),
      fadeOutSeconds: Number(music.fadeOutSeconds),
    },
    updatedAt: now,
  };
}

export function setBrand(session: Session, brand: string, now: string): Session {
  return {
    ...session,
    brand: String(brand ?? ""),
    updatedAt: now,
  };
}

export function setSceneColorBrightness(
  session: Session,
  sceneId: string,
  colorBrightness: number,
  now: string,
): Session {
  return {
    ...session,
    updatedAt: now,
    scenes: session.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      return { ...scene, colorBrightness: Number(colorBrightness) };
    }),
  };
}

export function replaceScenes(session: Session, scenes: Scene[], now: string): Session {
  return {
    ...session,
    scenes: scenes.map((scene, index) => ({ ...scene, index })),
    updatedAt: now,
  };
}
