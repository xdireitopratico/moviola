// main/index.ts
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join as join2 } from "node:path";
import { fileURLToPath } from "node:url";

// shared/media.ts
import { access, copyFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
function mediaUrl(absolutePath) {
  return pathToFileURL(absolutePath).href;
}
async function exportOutput(session, choosePath, copy = copyFile, probe = (path) => access(path).then(() => {
  return;
})) {
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

// shared/voice.ts
import { writeFile } from "node:fs/promises";
async function previewVoice(voice, text, url, destPath, fetchImpl = fetch, write = writeFile) {
  if (!url) {
    return { ok: false, reason: "sem url" };
  }
  if (!text.trim()) {
    return { ok: false, reason: "sem texto" };
  }
  const endpoint = new URL(url);
  endpoint.searchParams.set("voice", voice.id);
  endpoint.searchParams.set("speed", String(voice.speed));
  endpoint.searchParams.set("text", text);
  try {
    const response = await fetchImpl(endpoint);
    if (!response.ok) {
      return { ok: false, reason: `http ${response.status}` };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    await write(destPath, bytes);
    return { ok: true, filePath: destPath };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "falha de rede";
    return { ok: false, reason };
  }
}

// shared/contract.ts
var sceneStatuses = ["vazia", "gerando", "pronta", "falhou", "travada"];
var knownStatuses = new Set(sceneStatuses);
function defaultVoice() {
  return { id: "", speed: 1, pauseBetweenScenesSeconds: 0 };
}
function defaultMusic() {
  return {
    enabled: false,
    filePath: null,
    volume: 0.3,
    fadeInSeconds: 0,
    fadeOutSeconds: 0
  };
}
function defaultKenBurns() {
  return { enabled: false, startScale: 1, endScale: 1.1 };
}
function defaultCaptions() {
  return { enabled: false, srt: null };
}
function defaultScene(partial) {
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
    ...partial
  };
}
function createSession(launch, now = new Date().toISOString()) {
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
        durationSeconds: launch.durationSeconds
      })
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
    lastEvent: null
  };
}
function writeSceneText(scene, narration) {
  if (scene.status === "travada")
    return { ok: false, scene };
  return { ok: true, scene: { ...scene, narration } };
}
function musicForRequest(music) {
  if (!music.enabled || !music.filePath)
    return null;
  return {
    filePath: music.filePath,
    volume: music.volume,
    fadeInSeconds: music.fadeInSeconds,
    fadeOutSeconds: music.fadeOutSeconds
  };
}
function activeTextTracks(tracks) {
  return tracks.filter((track) => !track.locked);
}
function buildPostProdRequest(session, callback) {
  const ordered = [...session.scenes].sort((a, b) => a.index - b.index);
  const incomplete = ordered.find((scene) => scene.status !== "pronta");
  if (incomplete) {
    return {
      ok: false,
      sceneId: incomplete.id,
      sceneIndex: incomplete.index,
      reason: "incompleta"
    };
  }
  const missingFile = ordered.find((scene) => !scene.filePath);
  if (missingFile) {
    return {
      ok: false,
      sceneId: missingFile.id,
      sceneIndex: missingFile.index,
      reason: "sem_arquivo"
    };
  }
  const clips = ordered.map((scene) => scene.filePath);
  return {
    ok: true,
    request: {
      sessionId: session.id,
      projectName: session.projectName,
      clips,
      clipEffects: ordered.map((scene) => ({
        path: scene.filePath,
        kenBurns: scene.kenBurns,
        colorBrightness: scene.colorBrightness
      })),
      narrationUrl: session.narrationUrl,
      music: musicForRequest(session.music),
      srt: session.captions.enabled ? session.captions.srt : null,
      textTracks: activeTextTracks(session.textTracks),
      outputFormat: "mp4",
      callback
    }
  };
}
function setTranslation(scene, translation) {
  return { ...scene, translation };
}
function auditScene(scene, score) {
  return { ...scene, score };
}

// shared/callback.ts
import { writeFile as writeFile2 } from "node:fs/promises";
async function applyCallback(session, result, destPath, now, write = writeFile2) {
  if (!result.ok) {
    return {
      ...session,
      status: "failed",
      outputPath: null,
      reason: result.reason,
      updatedAt: now
    };
  }
  await write(destPath, result.bytes);
  return {
    ...session,
    status: "done",
    outputPath: destPath,
    reason: null,
    updatedAt: now
  };
}

// worker/concat.ts
import { spawn } from "node:child_process";
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    const errors = [];
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0)
        resolve();
      else
        reject(new Error(Buffer.concat(errors).toString("utf8") || `${command} saiu ${code}`));
    });
  });
}
var colorAdjustmentEnabled = true;
async function removeBackground(source, dest, keyColor = "0x00FF00") {
  await run("ffmpeg", [
    "-y",
    "-i",
    source,
    "-vf",
    `colorkey=${keyColor}:0.3:0.2`,
    "-pix_fmt",
    "yuva420p",
    dest
  ]);
}

// shared/postprod.ts
async function callWorker(session, workerUrl, destPath, now, fetchImpl = fetch) {
  if (!workerUrl) {
    return applyCallback(session, { ok: false, reason: "sem url" }, destPath, now);
  }
  const built = buildPostProdRequest(session, "app://callback");
  if (!built.ok) {
    return applyCallback(session, { ok: false, reason: built.reason }, destPath, now);
  }
  try {
    const response = await fetchImpl(workerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, callback: "app://callback" })
    });
    if (!response.ok) {
      return applyCallback(session, { ok: false, reason: `http ${response.status}` }, destPath, now);
    }
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("video/mp4")) {
      return applyCallback(session, { ok: false, reason: "resposta sem mp4" }, destPath, now);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return applyCallback(session, { ok: true, bytes }, destPath, now);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "falha de rede";
    return applyCallback(session, { ok: false, reason }, destPath, now);
  }
}

// shared/store.ts
import { mkdir, readdir, readFile, writeFile as writeFile3 } from "node:fs/promises";
import { join } from "node:path";
function fileOf(root, id) {
  return join(root, `${id}.json`);
}
async function saveSession(root, session) {
  await mkdir(root, { recursive: true });
  await writeFile3(fileOf(root, session.id), JSON.stringify(session), "utf8");
}
async function readSession(root, id) {
  const raw = await readFile(fileOf(root, id), "utf8");
  return JSON.parse(raw);
}
async function listSessions(root) {
  await mkdir(root, { recursive: true });
  const names = await readdir(root);
  const sessions = [];
  for (const name of names) {
    if (!name.endsWith(".json"))
      continue;
    const raw = await readFile(join(root, name), "utf8");
    sessions.push(JSON.parse(raw));
  }
  return sessions.sort((a, b) => a.updatedAt < b.updatedAt ? 1 : -1);
}
function withLaunch(session, launch, now) {
  const theme = launch.theme.trim();
  return {
    ...session,
    launch,
    projectName: theme || session.projectName,
    updatedAt: now
  };
}
function reorderScenes(session, orderedIds, now) {
  const byId = new Map(session.scenes.map((scene) => [scene.id, scene]));
  const scenes = orderedIds.map((id, index) => {
    const scene = byId.get(id);
    if (!scene)
      throw new Error(`cena ausente: ${id}`);
    return { ...scene, index };
  });
  return { ...session, scenes, updatedAt: now };
}
function setNarration(session, sceneId, narration, now) {
  return {
    ...session,
    updatedAt: now,
    scenes: session.scenes.map((scene) => {
      if (scene.id !== sceneId)
        return scene;
      return writeSceneText(scene, narration).scene;
    })
  };
}
function setVoice(session, voice, now) {
  return {
    ...session,
    voice: {
      id: String(voice.id ?? ""),
      speed: Number(voice.speed),
      pauseBetweenScenesSeconds: Number(voice.pauseBetweenScenesSeconds)
    },
    updatedAt: now
  };
}
function setSceneTransform(session, sceneId, transform, now) {
  return {
    ...session,
    updatedAt: now,
    scenes: session.scenes.map((scene) => {
      if (scene.id !== sceneId)
        return scene;
      return {
        ...scene,
        scale: Number(transform.scale),
        positionX: Number(transform.positionX),
        positionY: Number(transform.positionY),
        opacity: Number(transform.opacity)
      };
    })
  };
}
function setTextTracks(session, textTracks, now) {
  return {
    ...session,
    textTracks: textTracks.map((track) => ({
      id: String(track.id),
      text: String(track.text ?? ""),
      startSeconds: Number(track.startSeconds),
      endSeconds: Number(track.endSeconds),
      locked: Boolean(track.locked)
    })),
    updatedAt: now
  };
}
function setCaptions(session, captions, now) {
  return {
    ...session,
    captions: {
      enabled: Boolean(captions.enabled),
      srt: captions.srt == null ? null : String(captions.srt)
    },
    updatedAt: now
  };
}
function setMusic(session, music, now) {
  return {
    ...session,
    music: {
      enabled: Boolean(music.enabled),
      filePath: music.filePath == null || music.filePath === "" ? null : String(music.filePath),
      volume: Number(music.volume),
      fadeInSeconds: Number(music.fadeInSeconds),
      fadeOutSeconds: Number(music.fadeOutSeconds)
    },
    updatedAt: now
  };
}
function setBrand(session, brand, now) {
  return {
    ...session,
    brand: String(brand ?? ""),
    updatedAt: now
  };
}
function setSceneColorBrightness(session, sceneId, colorBrightness, now) {
  return {
    ...session,
    updatedAt: now,
    scenes: session.scenes.map((scene) => {
      if (scene.id !== sceneId)
        return scene;
      return { ...scene, colorBrightness: Number(colorBrightness) };
    })
  };
}
function replaceScenes(session, scenes, now) {
  return {
    ...session,
    scenes: scenes.map((scene, index) => ({ ...scene, index })),
    updatedAt: now
  };
}

// shared/launch.ts
function launchFrom(session) {
  return {
    theme: session.launch.theme,
    durationSeconds: session.launch.durationSeconds,
    aspectRatio: session.launch.aspectRatio,
    style: session.launch.style
  };
}
async function writeLaunch(root, id, launch, now) {
  const current = await readSession(root, id);
  const next = withLaunch(current, {
    theme: launch.theme,
    durationSeconds: launch.durationSeconds,
    aspectRatio: launch.aspectRatio,
    style: launch.style
  }, now);
  await saveSession(root, next);
  return next;
}

// shared/generate.ts
import { writeFile as writeFile4 } from "node:fs/promises";
async function runQueue(scenes, step) {
  const ordered = [...scenes].sort((a, b) => a.index - b.index);
  const done = [];
  let busy = false;
  for (const scene of ordered) {
    if (busy)
      throw new Error("fila paralela");
    busy = true;
    const finished = await step({ ...scene, status: "gerando", reason: null });
    busy = false;
    done.push(finished);
  }
  return done;
}
async function storeClip(scene, bytes, destPath, write = writeFile4) {
  await write(destPath, bytes);
  return { ...scene, status: "pronta", filePath: destPath, reason: null };
}

// shared/operations.ts
function record(sessionId, at, operation, detail) {
  return { id: crypto.randomUUID(), sessionId, at, operation, detail };
}
function beats(theme) {
  const name = theme.trim() || "Sem título";
  return [
    {
      title: "Abertura",
      narration: `${name}. O primeiro plano apresenta o tema.`,
      prompt: `abertura cinematográfica sobre ${name}`
    },
    {
      title: "Desenvolvimento",
      narration: `O meio de ${name} mostra o que muda.`,
      prompt: `plano médio sobre ${name}`
    },
    {
      title: "Virada",
      narration: `A virada de ${name} fica explícita.`,
      prompt: `close da virada de ${name}`
    },
    {
      title: "Fecho",
      narration: `${name} termina numa imagem que permanece.`,
      prompt: `plano final de ${name}`
    }
  ];
}
function draft(beat, index, durationSeconds, id) {
  return defaultScene({
    id,
    index,
    title: beat.title,
    narration: beat.narration,
    prompt: beat.prompt,
    durationSeconds
  });
}
function fillStoryboard(session, now) {
  const duration = Math.max(4, Math.round(session.launch.durationSeconds / 4));
  const scenes = beats(session.launch.theme).map((beat, index) => {
    const current = session.scenes.find((scene) => scene.index === index);
    if (current?.status === "travada")
      return { ...current, index };
    return draft(beat, index, duration, current?.id ?? crypto.randomUUID());
  });
  return { ...session, scenes, updatedAt: now };
}
function openSession(launch, now) {
  const session = createSession(launch, now);
  const event = record(session.id, now, "createSession", session.projectName);
  return { session: { ...session, lastEvent: event }, event };
}
function regenerateScene(session, sceneId, now) {
  const scenes = session.scenes.map((scene) => scene.id === sceneId ? { ...scene, status: "gerando", filePath: null } : scene);
  const event = record(session.id, now, "regenerateScene", sceneId);
  return { session: { ...session, scenes, updatedAt: now, lastEvent: event }, event };
}
function splitScene(session, sceneId, atSeconds, now) {
  const target = session.scenes.find((scene) => scene.id === sceneId);
  if (!target)
    throw new Error(`cena ausente: ${sceneId}`);
  if (atSeconds <= 0 || atSeconds >= target.durationSeconds) {
    throw new Error("corte inválido");
  }
  const left = defaultScene({
    ...target,
    id: crypto.randomUUID(),
    durationSeconds: atSeconds
  });
  const right = defaultScene({
    ...target,
    id: crypto.randomUUID(),
    durationSeconds: target.durationSeconds - atSeconds,
    filePath: null,
    status: target.filePath ? "vazia" : target.status
  });
  const without = session.scenes.filter((scene) => scene.id !== sceneId);
  const insertAt = target.index;
  const scenes = [...without, left, right].sort((a, b) => a.index - b.index).map((scene, index) => {
    if (scene.id === left.id)
      return { ...left, index: insertAt };
    if (scene.id === right.id)
      return { ...right, index: insertAt + 1 };
    return { ...scene, index: scene.index >= insertAt ? scene.index + 1 : scene.index };
  }).sort((a, b) => a.index - b.index).map((scene, index) => ({ ...scene, index }));
  const event = record(session.id, now, "splitScene", sceneId);
  return { ...session, scenes, updatedAt: now, lastEvent: event };
}

// shared/srt.ts
function stamp(totalSeconds) {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor(ms % 3600000 / 60000);
  const seconds = Math.floor(ms % 60000 / 1000);
  const millis = ms % 1000;
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}
function buildSrt(scenes, voice) {
  const ordered = [...scenes].sort((a, b) => a.index - b.index);
  const blocks = [];
  let cursor = 0;
  let index = 1;
  for (const scene of ordered) {
    const text = scene.narration.trim();
    if (!text) {
      cursor += scene.durationSeconds + voice.pauseBetweenScenesSeconds;
      continue;
    }
    const start = cursor;
    const end = cursor + scene.durationSeconds;
    blocks.push(`${index}
${stamp(start)} --> ${stamp(end)}
${text}`);
    index += 1;
    cursor = end + voice.pauseBetweenScenesSeconds;
  }
  return blocks.join(`

`);
}

// shared/history.ts
function createHistory(scenes) {
  return { past: [], present: scenes.map((scene) => ({ ...scene })), future: [] };
}
function editClips(history, next) {
  return {
    past: [...history.past, history.present],
    present: next.map((scene) => ({ ...scene })),
    future: []
  };
}
function undo(history) {
  const previous = history.past[history.past.length - 1];
  if (!previous)
    return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future]
  };
}
function redo(history) {
  const next = history.future[0];
  if (!next)
    return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1)
  };
}

// shared/ingest.ts
import { copyFile as copyFile2 } from "node:fs/promises";
import { spawn as spawn2 } from "node:child_process";
function run2(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn2(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    const err = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8")
      });
    });
  });
}
async function probeDuration(path) {
  const result = await run2("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    path
  ]);
  if (result.code !== 0)
    throw new Error(result.stderr || "ffprobe falhou");
  const duration = Number(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("duração inválida");
  return duration;
}
async function ingestLocalVideo(sourcePath, destPath, index = 0) {
  await copyFile2(sourcePath, destPath);
  const durationSeconds = await probeDuration(destPath);
  return defaultScene({
    id: crypto.randomUUID(),
    index,
    title: "Ingerido",
    durationSeconds,
    status: "pronta",
    filePath: destPath
  });
}
async function trimClip(sourcePath, destPath, startSeconds, durationSeconds) {
  if (startSeconds < 0 || durationSeconds <= 0)
    throw new Error("recorte inválido");
  const result = await run2("ffmpeg", [
    "-y",
    "-ss",
    String(startSeconds),
    "-i",
    sourcePath,
    "-t",
    String(durationSeconds),
    "-c",
    "copy",
    destPath
  ]);
  if (result.code !== 0)
    throw new Error(result.stderr || "ffmpeg trim falhou");
}

// shared/tools.ts
import { writeFile as writeFile5 } from "node:fs/promises";
async function searchStock(query, endpoint, fetchImpl = fetch) {
  if (!endpoint)
    throw new Error("sem url");
  if (!query.trim())
    return [];
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  const response = await fetchImpl(url);
  if (!response.ok)
    throw new Error(`http ${response.status}`);
  const payload = await response.json();
  return payload.results ?? [];
}
async function insertStockScene(session, option, destPath, now, fetchImpl = fetch) {
  const draft2 = defaultScene({
    id: crypto.randomUUID(),
    index: session.scenes.length,
    title: option.title,
    prompt: option.title,
    status: "vazia"
  });
  const [ready] = await runQueue([draft2], async (scene) => {
    const response = await fetchImpl(option.url);
    if (!response.ok) {
      return { ...scene, status: "falhou", reason: `http ${response.status}`, filePath: null };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return storeClip(scene, bytes, destPath);
  });
  if (!ready)
    throw new Error("fila vazia");
  return {
    ...session,
    scenes: [...session.scenes, { ...ready, index: session.scenes.length }],
    updatedAt: now
  };
}
async function generateAvatar(scene, url, destPath, fetchImpl = fetch) {
  const [done] = await runQueue([scene], async (current) => {
    if (!url)
      return { ...current, status: "falhou", reason: "sem url", filePath: null };
    const response = await fetchImpl(url);
    if (!response.ok) {
      return { ...current, status: "falhou", reason: `http ${response.status}`, filePath: null };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return storeClip(current, bytes, destPath);
  });
  if (!done)
    throw new Error("fila vazia");
  return done;
}
function fillFromSlides(session, slides, now) {
  const theme = slides.map((slide) => slide.trim()).filter(Boolean).join(" — ") || session.launch.theme;
  return fillStoryboard({ ...session, launch: { ...session.launch, theme } }, now);
}
async function dubNarration(session, url, destPath, now, fetchImpl = fetch) {
  if (!url) {
    return { ...session, narrationUrl: null, reason: "sem url", updatedAt: now };
  }
  const response = await fetchImpl(url);
  if (!response.ok) {
    return { ...session, reason: `http ${response.status}`, updatedAt: now };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile5(destPath, bytes);
  return { ...session, narrationUrl: destPath, reason: null, updatedAt: now };
}

// main/updateConfig.ts
var updateFeed = {
  owner: "xdireitopratico",
  repo: "moviola",
  version: "0.1.0-beta.001",
  publish: false
};

// main/releaseCheck.ts
async function publishedRelease(fetchImpl = fetch) {
  const tag = `v${updateFeed.version}`;
  const url = `https://api.github.com/repos/${updateFeed.owner}/${updateFeed.repo}/releases/tags/${tag}`;
  const response = await fetchImpl(url, {
    headers: { accept: "application/vnd.github+json", "user-agent": "moviola" }
  });
  if (!response.ok)
    return null;
  const body = await response.json();
  const asset = body.assets?.find((item) => typeof item.name === "string" && item.name.endsWith(".exe"))?.name;
  if (body.tag_name !== tag || !asset)
    return null;
  return { tag: body.tag_name, asset };
}

// main/index.ts
var here = fileURLToPath(new URL(".", import.meta.url));
function sessionsRoot() {
  if (process.env.MOVIOLA_SESSIONS)
    return process.env.MOVIOLA_SESSIONS;
  return join2(app.getPath("userData"), "sessions");
}
function registerSessionIpc() {
  const root = sessionsRoot();
  ipcMain.handle("moviola:list", () => listSessions(root));
  ipcMain.handle("moviola:read", (_event, id) => readSession(root, id));
  ipcMain.handle("moviola:writeLaunch", (_event, id, launch) => writeLaunch(root, id, launch, new Date().toISOString()));
  ipcMain.handle("moviola:create", async (_event, launch) => {
    const opened = openSession(launch, new Date().toISOString());
    await saveSession(root, opened.session);
    return opened.session;
  });
  ipcMain.handle("moviola:narration", async (_event, id, sceneId, narration) => {
    const current = await readSession(root, id);
    const next = setNarration(current, sceneId, narration, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:gate", async (_event, id) => {
    const session = await readSession(root, id);
    return buildPostProdRequest(session, "app://callback");
  });
  ipcMain.handle("moviola:render", async (_event, id) => {
    const current = await readSession(root, id);
    const dest = join2(root, `${id}.mp4`);
    const url = process.env.MOVIOLA_POSTPROD_URL ?? "http://127.0.0.1:8085/api/v1/post-production";
    const next = await callWorker(current, url, dest, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:regenerate", async (_event, id, sceneId) => {
    const current = await readSession(root, id);
    const next = regenerateScene(current, sceneId, new Date().toISOString());
    await saveSession(root, next.session);
    return next.session;
  });
  ipcMain.handle("moviola:reorder", async (_event, id, orderedIds) => {
    const current = await readSession(root, id);
    const next = reorderScenes(current, orderedIds, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:mediaUrl", (_event, absolutePath) => mediaUrl(absolutePath));
  ipcMain.handle("moviola:export", async (_event, id) => {
    const session = await readSession(root, id);
    return exportOutput(session, async () => {
      const result = await dialog.showSaveDialog({
        defaultPath: `${session.projectName || "moviola"}.mp4`,
        filters: [{ name: "MP4", extensions: ["mp4"] }]
      });
      if (result.canceled || !result.filePath)
        return null;
      return result.filePath;
    });
  });
  ipcMain.handle("moviola:setVoice", async (_event, id, voice) => {
    const current = await readSession(root, id);
    const next = setVoice(current, voice ?? defaultVoice(), new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:previewVoice", async (_event, id, text) => {
    const session = await readSession(root, id);
    const voice = session.voice ?? defaultVoice();
    const ordered = [...session.scenes].sort((a, b) => a.index - b.index);
    const sample = typeof text === "string" ? text : ordered[0]?.narration ?? "";
    const dest = join2(root, `${id}-preview.wav`);
    const url = process.env.MOVIOLA_TTS_URL ?? null;
    return previewVoice(voice, sample, url, dest);
  });
  ipcMain.handle("moviola:setTextTracks", async (_event, id, textTracks) => {
    const current = await readSession(root, id);
    const next = setTextTracks(current, textTracks, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  const histories = new Map;
  function historyFor(session) {
    let history = histories.get(session.id);
    if (!history) {
      history = createHistory(session.scenes);
      histories.set(session.id, history);
    }
    return history;
  }
  ipcMain.handle("moviola:setCaptions", async (_event, id, captions) => {
    const current = await readSession(root, id);
    let nextCaptions = captions ?? defaultCaptions();
    if (nextCaptions.enabled && !nextCaptions.srt) {
      nextCaptions = { ...nextCaptions, srt: buildSrt(current.scenes, current.voice ?? defaultVoice()) };
    }
    if (!nextCaptions.enabled) {
      nextCaptions = { ...nextCaptions, srt: null };
    }
    const next = setCaptions(current, nextCaptions, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:setMusic", async (_event, id, music) => {
    const current = await readSession(root, id);
    const next = setMusic(current, music ?? defaultMusic(), new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:setBrand", async (_event, id, brand) => {
    const current = await readSession(root, id);
    const next = setBrand(current, brand ?? "", new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:setSceneColorBrightness", async (_event, id, sceneId, colorBrightness) => {
    const current = await readSession(root, id);
    const next = setSceneColorBrightness(current, sceneId, colorBrightness, new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:colorAdjustmentEnabled", () => colorAdjustmentEnabled);
  ipcMain.handle("moviola:splitScene", async (_event, id, sceneId, atSeconds) => {
    const current = await readSession(root, id);
    const next = splitScene(current, sceneId, Number(atSeconds), new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:undo", async (_event, id) => {
    const current = await readSession(root, id);
    const history = undo(historyFor(current));
    histories.set(id, history);
    const next = replaceScenes(current, history.present, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:redo", async (_event, id) => {
    const current = await readSession(root, id);
    const history = redo(historyFor(current));
    histories.set(id, history);
    const next = replaceScenes(current, history.present, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:setSceneTransform", async (_event, id, sceneId, transform) => {
    const current = await readSession(root, id);
    const next = setSceneTransform(current, sceneId, transform, new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:ingestLocalVideo", async (_event, id) => {
    const picked = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm"] }]
    });
    if (picked.canceled || !picked.filePaths[0])
      return readSession(root, id);
    const current = await readSession(root, id);
    const dest = join2(root, `${id}-ingest-${Date.now()}.mp4`);
    const scene = await ingestLocalVideo(picked.filePaths[0], dest, current.scenes.length);
    const next = replaceScenes(current, [...current.scenes, scene], new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:trimClip", async (_event, id, sceneId, startSeconds, durationSeconds) => {
    const current = await readSession(root, id);
    const scene = current.scenes.find((item) => item.id === sceneId);
    if (!scene?.filePath)
      throw new Error("cena sem arquivo");
    const dest = join2(root, `${id}-trim-${Date.now()}.mp4`);
    await trimClip(scene.filePath, dest, Number(startSeconds), Number(durationSeconds));
    const scenes = current.scenes.map((item) => item.id === sceneId ? { ...item, filePath: dest, durationSeconds: Number(durationSeconds), status: "pronta" } : item);
    const next = replaceScenes(current, scenes, new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:setTranslation", async (_event, id, sceneId, translation) => {
    const current = await readSession(root, id);
    const scenes = current.scenes.map((scene) => scene.id === sceneId ? setTranslation(scene, String(translation ?? "")) : scene);
    const next = replaceScenes(current, scenes, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:dubNarration", async (_event, id, url) => {
    const current = await readSession(root, id);
    const dest = join2(root, `${id}-dub.wav`);
    const next = await dubNarration(current, url, dest, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:searchStock", async (_event, query) => {
    const endpoint = process.env.MOVIOLA_STOCK_URL ?? null;
    return searchStock(String(query ?? ""), endpoint);
  });
  ipcMain.handle("moviola:insertStockScene", async (_event, id, option) => {
    const current = await readSession(root, id);
    const dest = join2(root, `${id}-stock-${Date.now()}.mp4`);
    const next = await insertStockScene(current, option, dest, new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:generateAvatar", async (_event, id, sceneId, url) => {
    const current = await readSession(root, id);
    const scene = current.scenes.find((item) => item.id === sceneId);
    if (!scene)
      throw new Error("cena ausente");
    const dest = join2(root, `${id}-avatar-${Date.now()}.mp4`);
    const done = await generateAvatar(scene, url, dest);
    const scenes = current.scenes.map((item) => item.id === sceneId ? done : item);
    const next = replaceScenes(current, scenes, new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:fillFromSlides", async (_event, id, slides) => {
    const current = await readSession(root, id);
    const next = fillFromSlides(current, slides ?? [], new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:removeBackground", async (_event, id, sceneId) => {
    const current = await readSession(root, id);
    const scene = current.scenes.find((item) => item.id === sceneId);
    if (!scene?.filePath)
      throw new Error("cena sem arquivo");
    const dest = join2(root, `${id}-nobg-${Date.now()}.mp4`);
    await removeBackground(scene.filePath, dest);
    const scenes = current.scenes.map((item) => item.id === sceneId ? { ...item, filePath: dest, status: "pronta" } : item);
    const next = replaceScenes(current, scenes, new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:auditScene", async (_event, id, sceneId, score) => {
    const current = await readSession(root, id);
    const scenes = current.scenes.map((scene) => scene.id === sceneId ? auditScene(scene, score == null ? null : Number(score)) : scene);
    const next = replaceScenes(current, scenes, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
}
app.whenReady().then(async () => {
  registerSessionIpc();
  const probe = process.env.MOVIOLA_PROBE === "1";
  const check = process.env.MOVIOLA_CHECK ?? "";
  if (check === "100") {
    const seen = await publishedRelease();
    console.log(`RELEASE ${JSON.stringify(seen)}`);
    const ok = seen?.tag === "v0.1.0-beta.001" && Boolean(seen?.asset?.endsWith(".exe"));
    app.exit(ok ? 0 : 1);
    return;
  }
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: !probe && check === "",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join2(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  const entrada = join2(here, "..", "app", "entrada", "index.html");
  const session = process.env.MOVIOLA_SESSION ?? "";
  await win.loadFile(entrada, session ? { query: { session } } : undefined);
  if (check === "024") {
    await win.webContents.executeJavaScript("window.moviolaForm.ready");
    const before = await win.webContents.executeJavaScript("({theme:document.getElementById('themeInput').value,dur:[...document.querySelectorAll('.seg[data-group=dur] button')].find(b=>b.getAttribute('aria-pressed')==='true')?.dataset.v,format:[...document.querySelectorAll('.seg[data-group=format] button')].find(b=>b.getAttribute('aria-pressed')==='true')?.dataset.v,style:[...document.querySelectorAll('.chip')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.v).join(' + '),keys:Object.keys(window.moviolaForm.readLaunch()).sort().join(',')})");
    console.log(`BEFORE ${JSON.stringify(before)}`);
    const wrote = await win.webContents.executeJavaScript("(async()=>{try{const input=document.getElementById('themeInput');input.value='Tema editado';input.dispatchEvent(new Event('input',{bubbles:true}));await window.moviolaForm.saved();return 'wrote';}catch(error){return 'ERR '+String(error);}})()");
    console.log(`WROTE ${wrote}`);
    const saved = launchFrom(await readSession(sessionsRoot(), session));
    console.log(`SAVED ${JSON.stringify(saved)}`);
    const ok = wrote === "wrote" && before.theme === "Tema salvo" && before.dur === "30" && before.format === "9:16" && before.style === "Animação" && before.keys === "aspectRatio,durationSeconds,style,theme" && saved.theme === "Tema editado" && saved.durationSeconds === 30 && saved.aspectRatio === "9:16" && saved.style === "Animação";
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "025") {
    await win.webContents.executeJavaScript("window.moviolaForm.recents");
    const recents = await win.webContents.executeJavaScript("({names:[...document.querySelectorAll('#recentList button')].map((button)=>button.textContent),empty:document.getElementById('recentEmpty').hidden})");
    const stored = (await listSessions(sessionsRoot())).map((item) => item.projectName);
    console.log(`RECENTS ${JSON.stringify(recents)}`);
    console.log(`STORED ${JSON.stringify(stored)}`);
    const ok = JSON.stringify(recents.names) === JSON.stringify(stored) && recents.empty === stored.length > 0;
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "026") {
    const navigated = new Promise((resolve) => {
      win.webContents.once("did-finish-load", () => resolve());
    });
    const id = await win.webContents.executeJavaScript("(async()=>{const input=document.getElementById('themeInput');input.value='Viagem de barco';input.dispatchEvent(new Event('input',{bubbles:true}));return window.moviolaForm.createVideo();})()");
    await navigated;
    const url2 = win.webContents.getURL();
    const room = await win.webContents.executeJavaScript("window.moviolaRoom");
    const title = room.title;
    const saved = await readSession(sessionsRoot(), id);
    console.log(`CREATED ${id}`);
    console.log(`URL ${url2}`);
    console.log(`TITLE ${title}`);
    console.log(`FILE ${saved.projectName}`);
    const ok = url2.includes("criacao/index.html") && url2.includes(id) && title === "Viagem de barco" && saved.projectName === "Viagem de barco" && saved.status === "briefing";
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "037") {
    const opened = openSession({ theme: "Portão", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" }, "2026-10-06T00:00:00.000Z");
    const scene = opened.session.scenes[0];
    if (!scene)
      throw new Error("sessão sem cena");
    opened.session.scenes = [{ ...scene, title: "Abertura" }];
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join2(here, "..", "app", "criacao", "index.html"), { query: { session: opened.session.id } });
    const held = await win.webContents.executeJavaScript("(async()=>{await window.moviolaRoom;const button=document.getElementById('openEditor');button.click();return {disabled:button.getAttribute('aria-disabled'),text:document.getElementById('editorHold').textContent,url:location.pathname};})()");
    console.log(`HELD ${JSON.stringify(held)}`);
    const ok = held.disabled === "true" && held.text.includes("Abertura") && held.url.includes("criacao");
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "035") {
    const opened = openSession({ theme: "Regenerar", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" }, "2026-10-06T00:00:00.000Z");
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join2(here, "..", "app", "criacao", "index.html"), { query: { session: opened.session.id } });
    const shown = await win.webContents.executeJavaScript("(async()=>{await window.moviolaRoom;document.querySelector('.frame-regen').click();await window.moviolaRegenerate();return document.querySelector('.frame-status').textContent;})()");
    const saved = await readSession(sessionsRoot(), opened.session.id);
    console.log(`SHOWN ${shown}`);
    console.log(`STATUS ${saved.scenes[0]?.status}`);
    const ok = shown === "gerando" && saved.scenes[0]?.status === "gerando";
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "034") {
    const opened = openSession({ theme: "Ordem", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" }, "2026-10-06T00:00:00.000Z");
    const first = opened.session.scenes[0];
    if (!first)
      throw new Error("sessão sem cena");
    opened.session.scenes = [
      { ...first, id: "cena-a", index: 0, title: "A" },
      { ...first, id: "cena-b", index: 1, title: "B" }
    ];
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join2(here, "..", "app", "criacao", "index.html"), { query: { session: opened.session.id } });
    await win.webContents.executeJavaScript("(async()=>{await window.moviolaRoom;const buttons=[...document.querySelectorAll('.frame-up')];buttons[1].click();await window.moviolaReorder();})()");
    const saved = await readSession(sessionsRoot(), opened.session.id);
    const order = saved.scenes.map((scene) => `${scene.index}:${scene.id}`).join(",");
    console.log(`ORDER ${order}`);
    app.exit(order === "0:cena-b,1:cena-a" ? 0 : 1);
    return;
  }
  if (check === "033") {
    const opened = openSession({ theme: "Narração", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" }, "2026-10-06T00:00:00.000Z");
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join2(here, "..", "app", "criacao", "index.html"), { query: { session: opened.session.id } });
    const wrote = await win.webContents.executeJavaScript("(async()=>{await window.moviolaRoom;const box=document.getElementById('narrationBox');box.value='texto novo da cena';box.dispatchEvent(new Event('input',{bubbles:true}));await window.moviolaNarration();return box.value;})()");
    const saved = await readSession(sessionsRoot(), opened.session.id);
    console.log(`NARRATION ${saved.scenes[0]?.narration}`);
    const ok = wrote === "texto novo da cena" && saved.scenes[0]?.narration === "texto novo da cena";
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "032") {
    const opened = openSession({ theme: "Estados", durationSeconds: 60, aspectRatio: "16:9", style: "Documental" }, "2026-10-06T00:00:00.000Z");
    const statuses = ["vazia", "gerando", "pronta", "falhou", "travada"];
    opened.session.scenes = statuses.map((status, index) => ({
      id: `cena-${status}`,
      index,
      title: status,
      narration: "",
      prompt: "",
      durationSeconds: 4,
      status,
      filePath: null,
      reason: null,
      scale: 1,
      positionX: 0,
      positionY: 0,
      opacity: 1,
      kenBurns: { enabled: false, startScale: 1, endScale: 1.1 },
      colorBrightness: 0,
      translation: null,
      score: null
    }));
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join2(here, "..", "app", "criacao", "index.html"), { query: { session: opened.session.id } });
    const labels = await win.webContents.executeJavaScript("window.moviolaRoom.then(() => [...document.querySelectorAll('.frame')].map((node) => node.getAttribute('data-status')).join(','))");
    console.log(`STATES ${labels}`);
    app.exit(labels === "vazia,gerando,pronta,falhou,travada" ? 0 : 1);
    return;
  }
  if (check === "031") {
    const navigated = new Promise((resolve) => {
      win.webContents.once("did-finish-load", () => resolve());
    });
    await win.webContents.executeJavaScript("(async()=>{const input=document.getElementById('themeInput');input.value='Viagem de barco';input.dispatchEvent(new Event('input',{bubbles:true}));return window.moviolaForm.createVideo();})()");
    await navigated;
    const room = await win.webContents.executeJavaScript("window.moviolaRoom");
    const pages = await win.webContents.executeJavaScript("document.querySelectorAll('.step').length");
    console.log(`EVENT ${room.event}`);
    console.log(`STEPS ${pages}`);
    const ok = room.event === "createSession · Viagem de barco" && pages === 3;
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "061") {
    const opened = openSession({ theme: "Legendas Trilha", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" }, "2026-10-06T00:00:00.000Z");
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join2(here, "..", "app", "criacao", "index.html"), { query: { session: opened.session.id } });
    await win.webContents.executeJavaScript("window.moviolaRoom");
    const toggled = await win.webContents.executeJavaScript(`(async()=>{
      const sub=document.getElementById('subToggle');
      sub.click();
      await window.moviolaCaptions();
      const chip=[...document.querySelectorAll('#tracks .chip')].find(c=>c.dataset.v==='porto');
      chip.click();
      await window.moviolaMusic();
      return {
        sub: sub.getAttribute('aria-pressed'),
        track: document.getElementById('trackToggle').getAttribute('aria-pressed'),
      };
    })()`);
    const saved = await readSession(sessionsRoot(), opened.session.id);
    console.log(`UI ${JSON.stringify(toggled)}`);
    console.log(`CAPTIONS ${JSON.stringify(saved.captions)}`);
    console.log(`MUSIC ${JSON.stringify(saved.music)}`);
    const ok = toggled.sub === "true" && saved.captions.enabled === true && typeof saved.captions.srt === "string" && saved.music.enabled === true && saved.music.filePath === "/trilha/porto-seco.mp3";
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "070") {
    const opened = openSession({ theme: "Cor", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" }, "2026-10-06T00:00:00.000Z");
    const scene = opened.session.scenes[0];
    if (!scene)
      throw new Error("sem cena");
    opened.session.scenes = [{ ...scene, status: "pronta", filePath: "/tmp/x.mp4", title: "Clipe" }];
    opened.session.status = "done";
    opened.session.outputPath = "/tmp/x.mp4";
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join2(here, "..", "app", "editor", "index.html"), { query: { session: opened.session.id } });
    await win.webContents.executeJavaScript("window.moviolaEditor");
    const enabled = await win.webContents.executeJavaScript("window.moviola.colorAdjustmentEnabled()");
    const result = await win.webContents.executeJavaScript(`(async()=>{
      const cell=document.querySelector('#trackCells .track-cell');
      if(cell) cell.click();
      const input=document.getElementById('inspBrightness');
      const disabled=input ? input.disabled : true;
      if(input){ input.value='0.15'; input.dispatchEvent(new Event('change',{bubbles:true})); }
      await window.moviolaColor && window.moviolaColor();
      return {enabled: await window.moviola.colorAdjustmentEnabled(), disabled, value: input && input.value, cells: document.querySelectorAll("#trackCells .track-cell").length, holdHidden: document.getElementById("holdPanel") && document.getElementById("holdPanel").hidden, fn: typeof window.moviola.setSceneColorBrightness, sel: document.querySelector("#trackCells .track-cell.active") ? true : false};
    })()`);
    const saved = await readSession(sessionsRoot(), opened.session.id);
    console.log(`COLOR ${JSON.stringify(result)} brightness=${saved.scenes[0]?.colorBrightness}`);
    const ok = enabled === true && result.disabled === false && saved.scenes[0]?.colorBrightness === 0.15;
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "072") {
    const opened = openSession({ theme: "Lamina", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" }, "2026-10-06T00:00:00.000Z");
    const scene = opened.session.scenes[0];
    if (!scene)
      throw new Error("sem cena");
    opened.session.scenes = [{ ...scene, id: "clip-a", status: "pronta", filePath: "/tmp/x.mp4", durationSeconds: 4, title: "Clipe" }];
    opened.session.status = "done";
    opened.session.outputPath = "/tmp/x.mp4";
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join2(here, "..", "app", "editor", "index.html"), { query: { session: opened.session.id } });
    await win.webContents.executeJavaScript("window.moviolaEditor");
    const after = await win.webContents.executeJavaScript(`(async()=>{
      const cell=document.querySelector('#trackCells .track-cell');
      if(cell) cell.click();
      document.getElementById('btnBlade').click();
      await window.moviolaBlade();
      return (await window.moviola.read(new URLSearchParams(location.search).get('session'))).scenes.length;
    })()`);
    const saved = await readSession(sessionsRoot(), opened.session.id);
    console.log(`SCENES ${after} saved=${saved.scenes.length}`);
    app.exit(saved.scenes.length === 2 ? 0 : 1);
    return;
  }
  if (check === "077") {
    const opened = openSession({ theme: "Undo", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" }, "2026-10-06T00:00:00.000Z");
    const scene = opened.session.scenes[0];
    if (!scene)
      throw new Error("sem cena");
    opened.session.scenes = [{ ...scene, status: "pronta", filePath: "/tmp/x.mp4", title: "Clipe", scale: 1 }];
    opened.session.status = "done";
    opened.session.outputPath = "/tmp/x.mp4";
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join2(here, "..", "app", "editor", "index.html"), { query: { session: opened.session.id } });
    await win.webContents.executeJavaScript("window.moviolaEditor");
    const scales = await win.webContents.executeJavaScript(`(async()=>{
      const cell=document.querySelector('#trackCells .track-cell');
      if(cell) cell.click();
      const scale=document.getElementById('inspScale');
      scale.value='1.5'; scale.dispatchEvent(new Event('change',{bubbles:true}));
      await window.moviolaTransform();
      document.getElementById('btnUndo').click();
      await window.moviolaUndo();
      const afterUndo=(await window.moviola.read(new URLSearchParams(location.search).get('session'))).scenes[0].scale;
      document.getElementById('btnRedo').click();
      await window.moviolaRedo();
      const afterRedo=(await window.moviola.read(new URLSearchParams(location.search).get('session'))).scenes[0].scale;
      return {afterUndo, afterRedo};
    })()`);
    console.log(`UNDO ${JSON.stringify(scales)}`);
    const ok = scales.afterUndo === 1 && scales.afterRedo === 1.5;
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "082") {
    const opened = openSession({ theme: "Marca", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" }, "2026-10-06T00:00:00.000Z");
    const scene = opened.session.scenes[0];
    if (!scene)
      throw new Error("sem cena");
    opened.session.scenes = [{ ...scene, status: "pronta", filePath: "/tmp/x.mp4", title: "Clipe" }];
    opened.session.status = "done";
    opened.session.outputPath = "/tmp/x.mp4";
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join2(here, "..", "app", "editor", "index.html"), { query: { session: opened.session.id } });
    await win.webContents.executeJavaScript("window.moviolaEditor");
    const brand = await win.webContents.executeJavaScript(`(async()=>{
      const cell=document.querySelector('#trackCells .track-cell');
      if(cell) cell.click();
      const input=document.getElementById('inspBrand');
      return {value: input ? input.value : null, exists: !!input};
    })()`);
    const saved = await readSession(sessionsRoot(), opened.session.id);
    console.log(`BRAND ${JSON.stringify(brand)} session=${JSON.stringify(saved.brand)}`);
    const ok = brand.exists && brand.value === "" && saved.brand === "";
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "092") {
    const opened = openSession({ theme: "Ferramentas", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" }, "2026-10-06T00:00:00.000Z");
    opened.session.status = "done";
    opened.session.outputPath = "/tmp/x.mp4";
    const scene = opened.session.scenes[0];
    if (scene)
      opened.session.scenes = [{ ...scene, status: "pronta", filePath: "/tmp/x.mp4" }];
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join2(here, "..", "app", "editor", "index.html"), { query: { session: opened.session.id } });
    await win.webContents.executeJavaScript("window.moviolaEditor");
    const menu = await win.webContents.executeJavaScript(`(()=>{
      const items=[...document.querySelectorAll('#toolsMenu [data-tool]')].map(el=>el.dataset.tool);
      const pages=[...document.querySelectorAll('.step')].length;
      return {items, pages, menu: !!document.getElementById('toolsMenu')};
    })()`);
    console.log(`TOOLS ${JSON.stringify(menu)}`);
    const needed = ["ingestLocalVideo", "trimClip", "setTranslation", "dubNarration", "searchStock", "insertStockScene", "generateAvatar", "fillFromSlides", "removeBackground", "auditScene"];
    const ok = menu.menu && menu.pages === 3 && needed.every((name) => menu.items.includes(name));
    app.exit(ok ? 0 : 1);
    return;
  }
  if (!probe)
    return;
  const url = win.webContents.getURL();
  console.log(`MOVIOLA_OPEN ${url}`);
  app.exit(url.includes("entrada/index.html") ? 0 : 1);
});
