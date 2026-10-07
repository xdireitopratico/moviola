// main/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("moviola", {
  list() {
    return import_electron.ipcRenderer.invoke("moviola:list");
  },
  read(id) {
    return import_electron.ipcRenderer.invoke("moviola:read", id);
  },
  writeLaunch(id, launch) {
    return import_electron.ipcRenderer.invoke("moviola:writeLaunch", id, launch);
  }
});
