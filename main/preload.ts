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
});
