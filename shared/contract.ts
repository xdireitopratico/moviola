export const sceneStatuses = ["vazia", "gerando", "pronta", "falhou", "travada"] as const;

export type SceneStatus = (typeof sceneStatuses)[number];

export interface Scene {
  id: string;
  index: number;
  title: string;
  narration: string;
  prompt: string;
  durationSeconds: number;
  status: SceneStatus;
  filePath: string | null;
  reason: string | null;
}

export interface Launch {
  theme: string;
  durationSeconds: number;
  aspectRatio: string;
  style: string;
}

export interface Session {
  id: string;
  projectName: string;
  status: "briefing";
  launch: Launch;
  scenes: Scene[];
  createdAt: string;
  updatedAt: string;
  lastEvent: ActivityEvent | null;
}

export interface ActivityEvent {
  id: string;
  sessionId: string;
  at: string;
  operation: string;
  detail: string;
}

export interface PostProdRequest {
  sessionId: string;
  projectName: string;
  clips: string[];
  narrationUrl: string | null;
  outputFormat: "mp4";
  callback: string;
}

export type PostProdBuild =
  | { ok: true; request: PostProdRequest }
  | { ok: false; sceneId: string; sceneIndex: number; reason: "incompleta" | "sem_arquivo" };

const knownStatuses = new Set<string>(sceneStatuses);

export function isSceneStatus(value: string): value is SceneStatus {
  return knownStatuses.has(value);
}

export function parseSceneStatus(value: string): SceneStatus {
  if (!isSceneStatus(value)) {
    throw new Error(`estado de cena inválido: ${value}`);
  }
  return value;
}

export function createSession(launch: Launch, now = new Date().toISOString()): Session {
  return {
    id: crypto.randomUUID(),
    projectName: launch.theme.trim() || "Sem título",
    status: "briefing",
    launch,
    scenes: [
      {
        id: crypto.randomUUID(),
        index: 0,
        title: "",
        narration: "",
        prompt: "",
        durationSeconds: launch.durationSeconds,
        status: "vazia",
        filePath: null,
        reason: null,
      },
    ],
    createdAt: now,
    updatedAt: now,
    lastEvent: null,
  };
}

export function writeSceneText(
  scene: Scene,
  narration: string,
): { ok: true; scene: Scene } | { ok: false; scene: Scene } {
  if (scene.status === "travada") return { ok: false, scene };
  return { ok: true, scene: { ...scene, narration } };
}

export function buildPostProdRequest(session: Session, callback: string): PostProdBuild {
  const ordered = [...session.scenes].sort((a, b) => a.index - b.index);
  const incomplete = ordered.find((scene) => scene.status !== "pronta");
  if (incomplete) {
    return {
      ok: false,
      sceneId: incomplete.id,
      sceneIndex: incomplete.index,
      reason: "incompleta",
    };
  }
  const missingFile = ordered.find((scene) => !scene.filePath);
  if (missingFile) {
    return {
      ok: false,
      sceneId: missingFile.id,
      sceneIndex: missingFile.index,
      reason: "sem_arquivo",
    };
  }
  return {
    ok: true,
    request: {
      sessionId: session.id,
      projectName: session.projectName,
      clips: ordered.map((scene) => scene.filePath as string),
      narrationUrl: null,
      outputFormat: "mp4",
      callback,
    },
  };
}
