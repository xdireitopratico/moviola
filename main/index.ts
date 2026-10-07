import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportOutput, mediaUrl } from "../shared/media.ts";
import { previewVoice } from "../shared/voice.ts";
import { buildPostProdRequest, defaultVoice, defaultMusic, defaultCaptions, setTranslation, auditScene, type Launch, type VoiceSettings, type TextTrack, type CaptionsSettings, type MusicSettings, type Scene } from "../shared/contract.ts";
import { callWorker } from "../shared/postprod.ts";
import { launchFrom, writeLaunch } from "../shared/launch.ts";
import { openSession, regenerateScene, splitScene } from "../shared/operations.ts";
import { buildSrt } from "../shared/srt.ts";
import { createHistory, editClips, undo as undoHistory, redo as redoHistory, type ClipHistory } from "../shared/history.ts";
import { ingestLocalVideo, trimClip } from "../shared/ingest.ts";
import { searchStock, insertStockScene, generateAvatar, fillFromSlides, dubNarration } from "../shared/tools.ts";
import { removeBackground, colorAdjustmentEnabled } from "../worker/concat.ts";
import { listSessions, readSession, reorderScenes, saveSession, setNarration, setVoice, setSceneTransform, setTextTracks, setCaptions, setMusic, setBrand, setSceneColorBrightness, replaceScenes } from "../shared/store.ts";
import { publishedRelease } from "./releaseCheck.ts";

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
  ipcMain.handle("moviola:render", async (_event, id: string) => {
    const current = await readSession(root, id);
    const dest = join(root, `${id}.mp4`);
    const url = process.env.MOVIOLA_POSTPROD_URL ?? "http://127.0.0.1:8085/api/v1/post-production";
    const next = await callWorker(current, url, dest, new Date().toISOString());
    await saveSession(root, next);
    return next;
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
  ipcMain.handle("moviola:mediaUrl", (_event, absolutePath: string) => mediaUrl(absolutePath));
  ipcMain.handle("moviola:export", async (_event, id: string) => {
    const session = await readSession(root, id);
    return exportOutput(session, async () => {
      const result = await dialog.showSaveDialog({
        defaultPath: `${session.projectName || "moviola"}.mp4`,
        filters: [{ name: "MP4", extensions: ["mp4"] }],
      });
      if (result.canceled || !result.filePath) return null;
      return result.filePath;
    });
  });
  ipcMain.handle("moviola:setVoice", async (_event, id: string, voice: VoiceSettings) => {
    const current = await readSession(root, id);
    const next = setVoice(current, voice ?? defaultVoice(), new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:previewVoice", async (_event, id: string, text?: string) => {
    const session = await readSession(root, id);
    const voice = session.voice ?? defaultVoice();
    const ordered = [...session.scenes].sort((a, b) => a.index - b.index);
    const sample = typeof text === "string" ? text : (ordered[0]?.narration ?? "");
    const dest = join(root, `${id}-preview.wav`);
    const url = process.env.MOVIOLA_TTS_URL ?? null;
    return previewVoice(voice, sample, url, dest);
  });
  ipcMain.handle("moviola:setTextTracks", async (_event, id: string, textTracks: TextTrack[]) => {
    const current = await readSession(root, id);
    const next = setTextTracks(current, textTracks, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });

  const histories = new Map<string, ClipHistory>();

  function historyFor(session: { id: string; scenes: Scene[] }): ClipHistory {
    let history = histories.get(session.id);
    if (!history) {
      history = createHistory(session.scenes);
      histories.set(session.id, history);
    }
    return history;
  }

  ipcMain.handle("moviola:setCaptions", async (_event, id: string, captions: CaptionsSettings) => {
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
  ipcMain.handle("moviola:setMusic", async (_event, id: string, music: MusicSettings) => {
    const current = await readSession(root, id);
    const next = setMusic(current, music ?? defaultMusic(), new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:setBrand", async (_event, id: string, brand: string) => {
    const current = await readSession(root, id);
    const next = setBrand(current, brand ?? "", new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle(
    "moviola:setSceneColorBrightness",
    async (_event, id: string, sceneId: string, colorBrightness: number) => {
      const current = await readSession(root, id);
      const next = setSceneColorBrightness(current, sceneId, colorBrightness, new Date().toISOString());
      histories.set(id, editClips(historyFor(current), next.scenes));
      await saveSession(root, next);
      return next;
    },
  );
  ipcMain.handle("moviola:colorAdjustmentEnabled", () => colorAdjustmentEnabled);
  ipcMain.handle("moviola:splitScene", async (_event, id: string, sceneId: string, atSeconds: number) => {
    const current = await readSession(root, id);
    const next = splitScene(current, sceneId, Number(atSeconds), new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:undo", async (_event, id: string) => {
    const current = await readSession(root, id);
    const history = undoHistory(historyFor(current));
    histories.set(id, history);
    const next = replaceScenes(current, history.present, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:redo", async (_event, id: string) => {
    const current = await readSession(root, id);
    const history = redoHistory(historyFor(current));
    histories.set(id, history);
    const next = replaceScenes(current, history.present, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle(
    "moviola:setSceneTransform",
    async (
      _event,
      id: string,
      sceneId: string,
      transform: { scale: number; positionX: number; positionY: number; opacity: number },
    ) => {
      const current = await readSession(root, id);
      const next = setSceneTransform(current, sceneId, transform, new Date().toISOString());
      histories.set(id, editClips(historyFor(current), next.scenes));
      await saveSession(root, next);
      return next;
    },
  );
  ipcMain.handle("moviola:ingestLocalVideo", async (_event, id: string) => {
    const picked = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm"] }],
    });
    if (picked.canceled || !picked.filePaths[0]) return readSession(root, id);
    const current = await readSession(root, id);
    const dest = join(root, `${id}-ingest-${Date.now()}.mp4`);
    const scene = await ingestLocalVideo(picked.filePaths[0], dest, current.scenes.length);
    const next = replaceScenes(current, [...current.scenes, scene], new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle(
    "moviola:trimClip",
    async (_event, id: string, sceneId: string, startSeconds: number, durationSeconds: number) => {
      const current = await readSession(root, id);
      const scene = current.scenes.find((item) => item.id === sceneId);
      if (!scene?.filePath) throw new Error("cena sem arquivo");
      const dest = join(root, `${id}-trim-${Date.now()}.mp4`);
      await trimClip(scene.filePath, dest, Number(startSeconds), Number(durationSeconds));
      const scenes = current.scenes.map((item) =>
        item.id === sceneId
          ? { ...item, filePath: dest, durationSeconds: Number(durationSeconds), status: "pronta" as const }
          : item,
      );
      const next = replaceScenes(current, scenes, new Date().toISOString());
      histories.set(id, editClips(historyFor(current), next.scenes));
      await saveSession(root, next);
      return next;
    },
  );
  ipcMain.handle("moviola:setTranslation", async (_event, id: string, sceneId: string, translation: string) => {
    const current = await readSession(root, id);
    const scenes = current.scenes.map((scene) =>
      scene.id === sceneId ? setTranslation(scene, String(translation ?? "")) : scene,
    );
    const next = replaceScenes(current, scenes, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:dubNarration", async (_event, id: string, url: string | null) => {
    const current = await readSession(root, id);
    const dest = join(root, `${id}-dub.wav`);
    const next = await dubNarration(current, url, dest, new Date().toISOString());
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:searchStock", async (_event, query: string) => {
    const endpoint = process.env.MOVIOLA_STOCK_URL ?? null;
    return searchStock(String(query ?? ""), endpoint);
  });
  ipcMain.handle("moviola:insertStockScene", async (_event, id: string, option: { id: string; title: string; url: string }) => {
    const current = await readSession(root, id);
    const dest = join(root, `${id}-stock-${Date.now()}.mp4`);
    const next = await insertStockScene(current, option, dest, new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:generateAvatar", async (_event, id: string, sceneId: string, url: string | null) => {
    const current = await readSession(root, id);
    const scene = current.scenes.find((item) => item.id === sceneId);
    if (!scene) throw new Error("cena ausente");
    const dest = join(root, `${id}-avatar-${Date.now()}.mp4`);
    const done = await generateAvatar(scene, url, dest);
    const scenes = current.scenes.map((item) => (item.id === sceneId ? done : item));
    const next = replaceScenes(current, scenes, new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:fillFromSlides", async (_event, id: string, slides: string[]) => {
    const current = await readSession(root, id);
    const next = fillFromSlides(current, slides ?? [], new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:removeBackground", async (_event, id: string, sceneId: string) => {
    const current = await readSession(root, id);
    const scene = current.scenes.find((item) => item.id === sceneId);
    if (!scene?.filePath) throw new Error("cena sem arquivo");
    const dest = join(root, `${id}-nobg-${Date.now()}.mp4`);
    await removeBackground(scene.filePath, dest);
    const scenes = current.scenes.map((item) =>
      item.id === sceneId ? { ...item, filePath: dest, status: "pronta" as const } : item,
    );
    const next = replaceScenes(current, scenes, new Date().toISOString());
    histories.set(id, editClips(historyFor(current), next.scenes));
    await saveSession(root, next);
    return next;
  });
  ipcMain.handle("moviola:auditScene", async (_event, id: string, sceneId: string, score: number | null) => {
    const current = await readSession(root, id);
    const scenes = current.scenes.map((scene) =>
      scene.id === sceneId ? auditScene(scene, score == null ? null : Number(score)) : scene,
    );
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
      scale: 1,
      positionX: 0,
      positionY: 0,
      opacity: 1,
      kenBurns: { enabled: false, startScale: 1, endScale: 1.1 },
      colorBrightness: 0,
      translation: null,
      score: null,
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

  if (check === "061") {
    const opened = openSession(
      { theme: "Legendas Trilha", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
      "2026-10-06T00:00:00.000Z",
    );
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join(here, "..", "app", "criacao", "index.html"), { query: { session: opened.session.id } });
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
    const ok =
      toggled.sub === "true" &&
      saved.captions.enabled === true &&
      typeof saved.captions.srt === "string" &&
      saved.music.enabled === true &&
      saved.music.filePath === "/trilha/porto-seco.mp3";
    app.exit(ok ? 0 : 1);
    return;
  }


  if (check === "070") {
    const opened = openSession(
      { theme: "Cor", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
      "2026-10-06T00:00:00.000Z",
    );
    const scene = opened.session.scenes[0];
    if (!scene) throw new Error("sem cena");
    opened.session.scenes = [{ ...scene, status: "pronta", filePath: "/tmp/x.mp4", title: "Clipe" }];
    opened.session.status = "done";
    opened.session.outputPath = "/tmp/x.mp4";
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join(here, "..", "app", "editor", "index.html"), { query: { session: opened.session.id } });
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
    const opened = openSession(
      { theme: "Lamina", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
      "2026-10-06T00:00:00.000Z",
    );
    const scene = opened.session.scenes[0];
    if (!scene) throw new Error("sem cena");
    opened.session.scenes = [{ ...scene, id: "clip-a", status: "pronta", filePath: "/tmp/x.mp4", durationSeconds: 4, title: "Clipe" }];
    opened.session.status = "done";
    opened.session.outputPath = "/tmp/x.mp4";
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join(here, "..", "app", "editor", "index.html"), { query: { session: opened.session.id } });
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
    const opened = openSession(
      { theme: "Undo", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
      "2026-10-06T00:00:00.000Z",
    );
    const scene = opened.session.scenes[0];
    if (!scene) throw new Error("sem cena");
    opened.session.scenes = [{ ...scene, status: "pronta", filePath: "/tmp/x.mp4", title: "Clipe", scale: 1 }];
    opened.session.status = "done";
    opened.session.outputPath = "/tmp/x.mp4";
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join(here, "..", "app", "editor", "index.html"), { query: { session: opened.session.id } });
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
    const opened = openSession(
      { theme: "Marca", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
      "2026-10-06T00:00:00.000Z",
    );
    const scene = opened.session.scenes[0];
    if (!scene) throw new Error("sem cena");
    opened.session.scenes = [{ ...scene, status: "pronta", filePath: "/tmp/x.mp4", title: "Clipe" }];
    opened.session.status = "done";
    opened.session.outputPath = "/tmp/x.mp4";
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join(here, "..", "app", "editor", "index.html"), { query: { session: opened.session.id } });
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
    const opened = openSession(
      { theme: "Ferramentas", durationSeconds: 30, aspectRatio: "16:9", style: "Documental" },
      "2026-10-06T00:00:00.000Z",
    );
    opened.session.status = "done";
    opened.session.outputPath = "/tmp/x.mp4";
    const scene = opened.session.scenes[0];
    if (scene) opened.session.scenes = [{ ...scene, status: "pronta", filePath: "/tmp/x.mp4" }];
    await saveSession(sessionsRoot(), opened.session);
    await win.loadFile(join(here, "..", "app", "editor", "index.html"), { query: { session: opened.session.id } });
    await win.webContents.executeJavaScript("window.moviolaEditor");
    const menu = await win.webContents.executeJavaScript(`(()=>{
      const items=[...document.querySelectorAll('#toolsMenu [data-tool]')].map(el=>el.dataset.tool);
      const pages=[...document.querySelectorAll('.step')].length;
      return {items, pages, menu: !!document.getElementById('toolsMenu')};
    })()`);
    console.log(`TOOLS ${JSON.stringify(menu)}`);
    const needed = ["ingestLocalVideo","trimClip","setTranslation","dubNarration","searchStock","insertStockScene","generateAvatar","fillFromSlides","removeBackground","auditScene"];
    const ok = menu.menu && menu.pages === 3 && needed.every((name) => menu.items.includes(name));
    app.exit(ok ? 0 : 1);
    return;
  }

  if (!probe) return;
  const url = win.webContents.getURL();
  console.log(`MOVIOLA_OPEN ${url}`);
  app.exit(url.includes("entrada/index.html") ? 0 : 1);
});
