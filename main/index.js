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

// shared/operations.ts
function record(sessionId, at, operation, detail) {
  return { id: crypto.randomUUID(), sessionId, at, operation, detail };
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
  ipcMain.handle("moviola:setSceneTransform", async (_event, id, sceneId, transform) => {
    const current = await readSession(root, id);
    const next = setSceneTransform(current, sceneId, transform, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:setTextTracks", async (_event, id, textTracks) => {
    const current = await readSession(root, id);
    const next = setTextTracks(current, textTracks, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
}
app.whenReady().then(async () => {
  registerSessionIpc();
  const probe = process.env.MOVIOLA_PROBE === "1";
  const check = process.env.MOVIOLA_CHECK ?? "";
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
  if (!probe)
    return;
  const url = win.webContents.getURL();
  console.log(`MOVIOLA_OPEN ${url}`);
  app.exit(url.includes("entrada/index.html") ? 0 : 1);
});
