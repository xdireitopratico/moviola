import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSession, type Launch } from "../shared/contract.ts";
import { launchFrom, writeLaunch } from "../shared/launch.ts";
import { listSessions, readSession, saveSession } from "../shared/store.ts";

const here = fileURLToPath(new URL(".", import.meta.url));

function sessionsRoot(): string {
  if (process.env.MOVIOLA_SESSIONS) return process.env.MOVIOLA_SESSIONS;
  return join(app.getPath("userData"), "sessions");
}

function registerSessionIpc(): void {
  const root = sessionsRoot();
  ipcMain.handle("moviola:list", () => listSessions(root));
  ipcMain.handle("moviola:read", (_event, id: string) => readSession(root, id));
  ipcMain.handle("moviola:writeLaunch", (_event, id: string, launch: Launch) =>
    writeLaunch(root, id, launch, new Date().toISOString()),
  );
  ipcMain.handle("moviola:create", async (_event, launch: Launch) => {
    const session = createSession(launch, new Date().toISOString());
    await saveSession(root, session);
    return session;
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
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  const entrada = join(here, "..", "app", "entrada", "index.html");
  const session = process.env.MOVIOLA_SESSION ?? "";
  await win.loadFile(entrada, session ? { query: { session } } : undefined);
  if (check === "024") {
    await win.webContents.executeJavaScript("window.moviolaForm.ready");
    const before = await win.webContents.executeJavaScript("({theme:document.getElementById('themeInput').value,dur:[...document.querySelectorAll('.seg[data-group=dur] button')].find(b=>b.getAttribute('aria-pressed')==='true')?.dataset.v,format:[...document.querySelectorAll('.seg[data-group=format] button')].find(b=>b.getAttribute('aria-pressed')==='true')?.dataset.v,style:[...document.querySelectorAll('.chip')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.v).join(' + '),keys:Object.keys(window.moviolaForm.readLaunch()).sort().join(',')})") as {
      theme: string;
      dur: string;
      format: string;
      style: string;
      keys: string;
    };
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
    const recents = await win.webContents.executeJavaScript("({names:[...document.querySelectorAll('#recentList button')].map((button)=>button.textContent),empty:document.getElementById('recentEmpty').hidden})") as {
      names: string[];
      empty: boolean;
    };
    const stored = (await listSessions(sessionsRoot())).map((item) => item.projectName);
    console.log(`RECENTS ${JSON.stringify(recents)}`);
    console.log(`STORED ${JSON.stringify(stored)}`);
    const ok = JSON.stringify(recents.names) === JSON.stringify(stored) && recents.empty === (stored.length > 0);
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "026") {
    const navigated = new Promise<void>((resolve) => {
      win.webContents.once("did-finish-load", () => resolve());
    });
    const id = await win.webContents.executeJavaScript("(async()=>{const input=document.getElementById('themeInput');input.value='Viagem de barco';input.dispatchEvent(new Event('input',{bubbles:true}));return window.moviolaForm.createVideo();})()") as string;
    await navigated;
    const url = win.webContents.getURL();
    const title = await win.webContents.executeJavaScript("window.moviolaRoom") as string;
    const saved = await readSession(sessionsRoot(), id);
    console.log(`CREATED ${id}`);
    console.log(`URL ${url}`);
    console.log(`TITLE ${title}`);
    console.log(`FILE ${saved.projectName}`);
    const ok = url.includes("criacao/index.html") && url.includes(id) && title === "Viagem de barco" && saved.projectName === "Viagem de barco" && saved.status === "briefing";
    app.exit(ok ? 0 : 1);
    return;
  }
  if (!probe) return;
  const url = win.webContents.getURL();
  console.log(`MOVIOLA_OPEN ${url}`);
  app.exit(url.includes("entrada/index.html") ? 0 : 1);
});
