// main/index.ts
import { app, BrowserWindow, ipcMain } from "electron";
import { join as join2 } from "node:path";
import { fileURLToPath } from "node:url";

// shared/store.ts
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// shared/contract.ts
var sceneStatuses = ["vazia", "gerando", "pronta", "falhou", "travada"];
var knownStatuses = new Set(sceneStatuses);
function createSession(launch, now = new Date().toISOString()) {
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
        filePath: null
      }
    ],
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

// shared/store.ts
function fileOf(root, id) {
  return join(root, `${id}.json`);
}
async function saveSession(root, session) {
  await mkdir(root, { recursive: true });
  await writeFile(fileOf(root, session.id), JSON.stringify(session), "utf8");
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
      filePath: null
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
