import { contextBridge, ipcRenderer } from "electron";
import type { Launch, Session, VoiceSettings, TextTrack, CaptionsSettings, MusicSettings } from "../shared/contract.ts";

contextBridge.exposeInMainWorld("moviola", {
  list(): Promise<Session[]> {
    return ipcRenderer.invoke("moviola:list");
  },
  read(id: string): Promise<Session> {
    return ipcRenderer.invoke("moviola:read", id);
  },
  writeLaunch(id: string, launch: Launch): Promise<Session> {
    return ipcRenderer.invoke("moviola:writeLaunch", id, launch);
  },
  create(launch: Launch): Promise<Session> {
    return ipcRenderer.invoke("moviola:create", launch);
  },
  setNarration(id: string, sceneId: string, narration: string): Promise<Session> {
    return ipcRenderer.invoke("moviola:narration", id, sceneId, narration);
  },
  reorder(id: string, orderedIds: string[]): Promise<Session> {
    return ipcRenderer.invoke("moviola:reorder", id, orderedIds);
  },
  regenerate(id: string, sceneId: string): Promise<Session> {
    return ipcRenderer.invoke("moviola:regenerate", id, sceneId);
  },
  gate(id: string): Promise<{ ok: true } | { ok: false; sceneId: string; sceneIndex: number; reason: string }> {
    return ipcRenderer.invoke("moviola:gate", id);
  },
  render(id: string): Promise<Session> {
    return ipcRenderer.invoke("moviola:render", id);
  },
  mediaUrl(absolutePath: string): Promise<string> {
    return ipcRenderer.invoke("moviola:mediaUrl", absolutePath);
  },
  export(id: string): Promise<
    { ok: true; path: string } | { ok: false; reason: "cancelado" | "sem_saida" | "arquivo_ausente" }
  > {
    return ipcRenderer.invoke("moviola:export", id);
  },
  setVoice(id: string, voice: VoiceSettings): Promise<Session> {
    return ipcRenderer.invoke("moviola:setVoice", id, voice);
  },
  previewVoice(id: string, text?: string): Promise<{ ok: true; filePath: string } | { ok: false; reason: string }> {
    return ipcRenderer.invoke("moviola:previewVoice", id, text);
  },
  setSceneTransform(
    id: string,
    sceneId: string,
    transform: { scale: number; positionX: number; positionY: number; opacity: number },
  ): Promise<Session> {
    return ipcRenderer.invoke("moviola:setSceneTransform", id, sceneId, transform);
  },
  setTextTracks(id: string, textTracks: TextTrack[]): Promise<Session> {
    return ipcRenderer.invoke("moviola:setTextTracks", id, textTracks);
  },
  setCaptions(id: string, captions: CaptionsSettings): Promise<Session> {
    return ipcRenderer.invoke("moviola:setCaptions", id, captions);
  },
  setMusic(id: string, music: MusicSettings): Promise<Session> {
    return ipcRenderer.invoke("moviola:setMusic", id, music);
  },
  setBrand(id: string, brand: string): Promise<Session> {
    return ipcRenderer.invoke("moviola:setBrand", id, brand);
  },
  setSceneColorBrightness(id: string, sceneId: string, colorBrightness: number): Promise<Session> {
    return ipcRenderer.invoke("moviola:setSceneColorBrightness", id, sceneId, colorBrightness);
  },
  colorAdjustmentEnabled(): Promise<boolean> {
    return ipcRenderer.invoke("moviola:colorAdjustmentEnabled");
  },
  splitScene(id: string, sceneId: string, atSeconds: number): Promise<Session> {
    return ipcRenderer.invoke("moviola:splitScene", id, sceneId, atSeconds);
  },
  undo(id: string): Promise<Session> {
    return ipcRenderer.invoke("moviola:undo", id);
  },
  redo(id: string): Promise<Session> {
    return ipcRenderer.invoke("moviola:redo", id);
  },
  ingestLocalVideo(id: string): Promise<Session> {
    return ipcRenderer.invoke("moviola:ingestLocalVideo", id);
  },
  trimClip(id: string, sceneId: string, startSeconds: number, durationSeconds: number): Promise<Session> {
    return ipcRenderer.invoke("moviola:trimClip", id, sceneId, startSeconds, durationSeconds);
  },
  setTranslation(id: string, sceneId: string, translation: string): Promise<Session> {
    return ipcRenderer.invoke("moviola:setTranslation", id, sceneId, translation);
  },
  dubNarration(id: string, url: string | null): Promise<Session> {
    return ipcRenderer.invoke("moviola:dubNarration", id, url);
  },
  searchStock(query: string): Promise<Array<{ id: string; title: string; url: string }>> {
    return ipcRenderer.invoke("moviola:searchStock", query);
  },
  insertStockScene(id: string, option: { id: string; title: string; url: string }): Promise<Session> {
    return ipcRenderer.invoke("moviola:insertStockScene", id, option);
  },
  generateAvatar(id: string, sceneId: string, url: string | null): Promise<Session> {
    return ipcRenderer.invoke("moviola:generateAvatar", id, sceneId, url);
  },
  fillFromSlides(id: string, slides: string[]): Promise<Session> {
    return ipcRenderer.invoke("moviola:fillFromSlides", id, slides);
  },
  removeBackground(id: string, sceneId: string): Promise<Session> {
    return ipcRenderer.invoke("moviola:removeBackground", id, sceneId);
  },
  auditScene(id: string, sceneId: string, score: number | null): Promise<Session> {
    return ipcRenderer.invoke("moviola:auditScene", id, sceneId, score);
  },
});
