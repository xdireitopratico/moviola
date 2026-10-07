export const sceneStatuses = ["vazia", "gerando", "pronta", "falhou", "travada"] as const;

export type SceneStatus = (typeof sceneStatuses)[number];

export interface KenBurns {
  enabled: boolean;
  startScale: number;
  endScale: number;
}

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
  scale: number;
  positionX: number;
  positionY: number;
  opacity: number;
  kenBurns: KenBurns;
  colorBrightness: number;
  translation: string | null;
  score: number | null;
}

export interface Launch {
  theme: string;
  durationSeconds: number;
  aspectRatio: string;
  style: string;
}

export interface VoiceSettings {
  id: string;
  speed: number;
  pauseBetweenScenesSeconds: number;
}

export interface MusicSettings {
  enabled: boolean;
  filePath: string | null;
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

export interface MusicRequest {
  filePath: string;
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

export interface TextTrack {
  id: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
  locked: boolean;
}

export interface CaptionsSettings {
  enabled: boolean;
  srt: string | null;
}

export const sessionStatuses = ["briefing", "done", "failed"] as const;

export type SessionStatus = (typeof sessionStatuses)[number];

export interface Session {
  id: string;
  projectName: string;
  status: SessionStatus;
  brand: string;
  launch: Launch;
  scenes: Scene[];
  voice: VoiceSettings;
  music: MusicSettings;
  captions: CaptionsSettings;
  narrationUrl: string | null;
  textTracks: TextTrack[];
  outputPath: string | null;
  reason: string | null;
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

export interface ClipRequest {
  path: string;
  kenBurns: KenBurns;
  colorBrightness: number;
}

export interface PostProdRequest {
  sessionId: string;
  projectName: string;
  clips: string[];
  clipEffects: ClipRequest[];
  narrationUrl: string | null;
  music: MusicRequest | null;
  srt: string | null;
  textTracks: TextTrack[];
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

export function defaultVoice(): VoiceSettings {
  return { id: "", speed: 1, pauseBetweenScenesSeconds: 0 };
}

export function defaultMusic(): MusicSettings {
  return {
    enabled: false,
    filePath: null,
    volume: 0.3,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
  };
}

export function defaultKenBurns(): KenBurns {
  return { enabled: false, startScale: 1, endScale: 1.1 };
}

export function defaultCaptions(): CaptionsSettings {
  return { enabled: false, srt: null };
}

export function defaultScene(partial: Partial<Scene> & Pick<Scene, "id" | "index">): Scene {
  return {
    title: "",
    narration: "",
    prompt: "",
    durationSeconds: 8,
    status: "vazia",
    filePath: null,
    reason: null,
    scale: 1,
    positionX: 0,
    positionY: 0,
    opacity: 1,
    kenBurns: defaultKenBurns(),
    colorBrightness: 0,
    translation: null,
    score: null,
    ...partial,
  };
}

export function createSession(launch: Launch, now = new Date().toISOString()): Session {
  return {
    id: crypto.randomUUID(),
    projectName: launch.theme.trim() || "Sem título",
    status: "briefing",
    brand: "",
    launch,
    scenes: [
      defaultScene({
        id: crypto.randomUUID(),
        index: 0,
        durationSeconds: launch.durationSeconds,
      }),
    ],
    voice: defaultVoice(),
    music: defaultMusic(),
    captions: defaultCaptions(),
    narrationUrl: null,
    textTracks: [],
    outputPath: null,
    reason: null,
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

export function musicForRequest(music: MusicSettings): MusicRequest | null {
  if (!music.enabled || !music.filePath) return null;
  return {
    filePath: music.filePath,
    volume: music.volume,
    fadeInSeconds: music.fadeInSeconds,
    fadeOutSeconds: music.fadeOutSeconds,
  };
}

export function activeTextTracks(tracks: TextTrack[]): TextTrack[] {
  return tracks.filter((track) => !track.locked);
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
  const clips = ordered.map((scene) => scene.filePath as string);
  return {
    ok: true,
    request: {
      sessionId: session.id,
      projectName: session.projectName,
      clips,
      clipEffects: ordered.map((scene) => ({
        path: scene.filePath as string,
        kenBurns: scene.kenBurns,
        colorBrightness: scene.colorBrightness,
      })),
      narrationUrl: session.narrationUrl,
      music: musicForRequest(session.music),
      srt: session.captions.enabled ? session.captions.srt : null,
      textTracks: activeTextTracks(session.textTracks),
      outputFormat: "mp4",
      callback,
    },
  };
}

export function setTranslation(scene: Scene, translation: string): Scene {
  return { ...scene, translation };
}

export function auditScene(scene: Scene, score: number | null): Scene {
  return { ...scene, score };
}
