import { contextBridge, ipcRenderer } from "electron";
import type { Launch, Session, VoiceSettings, TextTrack } from "../shared/contract.ts";

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
});
