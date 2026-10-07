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
  if (!probe)
    return;
  const url = win.webContents.getURL();
  console.log(`MOVIOLA_OPEN ${url}`);
  app.exit(url.includes("entrada/index.html") ? 0 : 1);
});
