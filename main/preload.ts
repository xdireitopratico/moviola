import { contextBridge, ipcRenderer } from "electron";
import type { Launch, Session } from "../shared/contract.ts";

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
});
