import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPostProdRequest, type Launch } from "../shared/contract.ts";
import { launchFrom, writeLaunch } from "../shared/launch.ts";
import { openSession, regenerateScene } from "../shared/operations.ts";
import { listSessions, readSession, reorderScenes, saveSession, setNarration } from "../shared/store.ts";

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
    const opened = openSession(launch, new Date().toISOString());
    await saveSession(root, opened.session);
    return opened.session;
  });
  ipcMain.handle("moviola:narration", async (_event, id: string, sceneId: string, narration: string) => {
    const current = await readSession(root, id);
    const next = setNarration(current, sceneId, narration, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:gate", async (_event, id: string) => {
    const session = await readSession(root, id);
    return buildPostProdRequest(session, "app://callback");
  });
  ipcMain.handle("moviola:regenerate", async (_event, id: string, sceneId: string) => {
    const current = await readSession(root, id);
    const next = regenerateScene(current, sceneId, new Date().toISOString());
    await saveSession(root, next.session);
    return next.session;
  });
  ipcMain.handle("moviola:reorder", async (_event, id: string, orderedIds: string[]) => {
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
    const room = await win.webContents.executeJavaScript("window.moviolaRoom") as { title: string; event: string };
    const title = room.title;
    const saved = await readSession(sessionsRoot(), id);
    console.log(`CREATED ${id}`);
    console.log(`URL ${url}`);
    console.log(`TITLE ${title}`);
    console.log(`FILE ${saved.projectName}`);
    const ok = url.includes("criacao/index.html") && url.includes(id) && title === "Viagem de barco" && saved.projectName === "Viagem de barco" && saved.status === "briefing";
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "037") {
    const opened = openSession(
      { theme: "Portão", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
      "2026-10-06T00:00:00.000Z",
    );
    const scene = opened.session.scenes[0];
    if (!scene) throw new Error("sessão sem cena");
    opened.session.scenes = [{ ...scene, title: "Abertura" }];
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join(here, "..", "app", "criacao", "index.html"), { query: { session: opened.session.id } });
    const held = await win.webContents.executeJavaScript("(async()=>{await window.moviolaRoom;const button=document.getElementById('openEditor');button.click();return {disabled:button.getAttribute('aria-disabled'),text:document.getElementById('editorHold').textContent,url:location.pathname};})()") as { disabled: string; text: string; url: string };
    console.log(`HELD ${JSON.stringify(held)}`);
    const ok = held.disabled === "true" && held.text.includes("Abertura") && held.url.includes("criacao");
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "035") {
    const opened = openSession(
      { theme: "Regenerar", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
      "2026-10-06T00:00:00.000Z",
    );
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join(here, "..", "app", "criacao", "index.html"), { query: { session: opened.session.id } });
    const shown = await win.webContents.executeJavaScript("(async()=>{await window.moviolaRoom;document.querySelector('.frame-regen').click();await window.moviolaRegenerate();return document.querySelector('.frame-status').textContent;})()") as string;
    const saved = await readSession(sessionsRoot(), opened.session.id);
    console.log(`SHOWN ${shown}`);
    console.log(`STATUS ${saved.scenes[0]?.status}`);
    const ok = shown === "gerando" && saved.scenes[0]?.status === "gerando";
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "034") {
    const opened = openSession(
      { theme: "Ordem", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
      "2026-10-06T00:00:00.000Z",
    );
    const first = opened.session.scenes[0];
    if (!first) throw new Error("sessão sem cena");
    opened.session.scenes = [
      { ...first, id: "cena-a", index: 0, title: "A" },
      { ...first, id: "cena-b", index: 1, title: "B" },
    ];
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join(here, "..", "app", "criacao", "index.html"), { query: { session: opened.session.id } });
    await win.webContents.executeJavaScript("(async()=>{await window.moviolaRoom;const buttons=[...document.querySelectorAll('.frame-up')];buttons[1].click();await window.moviolaReorder();})()");
    const saved = await readSession(sessionsRoot(), opened.session.id);
    const order = saved.scenes.map((scene) => `${scene.index}:${scene.id}`).join(",");
    console.log(`ORDER ${order}`);
    app.exit(order === "0:cena-b,1:cena-a" ? 0 : 1);
    return;
  }
  if (check === "033") {
    const opened = openSession(
      { theme: "Narração", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
      "2026-10-06T00:00:00.000Z",
    );
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join(here, "..", "app", "criacao", "index.html"), { query: { session: opened.session.id } });
    const wrote = await win.webContents.executeJavaScript("(async()=>{await window.moviolaRoom;const box=document.getElementById('narrationBox');box.value='texto novo da cena';box.dispatchEvent(new Event('input',{bubbles:true}));await window.moviolaNarration();return box.value;})()") as string;
    const saved = await readSession(sessionsRoot(), opened.session.id);
    console.log(`NARRATION ${saved.scenes[0]?.narration}`);
    const ok = wrote === "texto novo da cena" && saved.scenes[0]?.narration === "texto novo da cena";
    app.exit(ok ? 0 : 1);
    return;
  }
  if (check === "032") {
    const opened = openSession(
      { theme: "Estados", durationSeconds: 60, aspectRatio: "16:9", style: "Documental" },
      "2026-10-06T00:00:00.000Z",
    );
    const statuses = ["vazia", "gerando", "pronta", "falhou", "travada"] as const;
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
    }));
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join(here, "..", "app", "criacao", "index.html"), { query: { session: opened.session.id } });
    const labels = await win.webContents.executeJavaScript("window.moviolaRoom.then(() => [...document.querySelectorAll('.frame')].map((node) => node.getAttribute('data-status')).join(','))") as string;
    console.log(`STATES ${labels}`);
    app.exit(labels === "vazia,gerando,pronta,falhou,travada" ? 0 : 1);
    return;
  }
  if (check === "031") {
    const navigated = new Promise<void>((resolve) => {
      win.webContents.once("did-finish-load", () => resolve());
    });
    await win.webContents.executeJavaScript("(async()=>{const input=document.getElementById('themeInput');input.value='Viagem de barco';input.dispatchEvent(new Event('input',{bubbles:true}));return window.moviolaForm.createVideo();})()");
    await navigated;
    const room = await win.webContents.executeJavaScript("window.moviolaRoom") as { title: string; event: string };
    const pages = await win.webContents.executeJavaScript("document.querySelectorAll('.step').length") as number;
    console.log(`EVENT ${room.event}`);
    console.log(`STEPS ${pages}`);
    const ok = room.event === "createSession · Viagem de barco" && pages === 3;
    app.exit(ok ? 0 : 1);
    return;
  }
  if (!probe) return;
  const url = win.webContents.getURL();
  console.log(`MOVIOLA_OPEN ${url}`);
  app.exit(url.includes("entrada/index.html") ? 0 : 1);
});
