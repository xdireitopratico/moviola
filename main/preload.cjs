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
  },
  create(launch) {
    return import_electron.ipcRenderer.invoke("moviola:create", launch);
  },
  setNarration(id, sceneId, narration) {
    return import_electron.ipcRenderer.invoke("moviola:narration", id, sceneId, narration);
  },
  reorder(id, orderedIds) {
    return import_electron.ipcRenderer.invoke("moviola:reorder", id, orderedIds);
  },
  regenerate(id, sceneId) {
    return import_electron.ipcRenderer.invoke("moviola:regenerate", id, sceneId);
  },
  gate(id) {
    return import_electron.ipcRenderer.invoke("moviola:gate", id);
  },
  render(id) {
    return import_electron.ipcRenderer.invoke("moviola:render", id);
  },
  mediaUrl(absolutePath) {
    return import_electron.ipcRenderer.invoke("moviola:mediaUrl", absolutePath);
  },
  export(id) {
    return import_electron.ipcRenderer.invoke("moviola:export", id);
  },
  setVoice(id, voice) {
    return import_electron.ipcRenderer.invoke("moviola:setVoice", id, voice);
  },
  previewVoice(id, text) {
    return import_electron.ipcRenderer.invoke("moviola:previewVoice", id, text);
  },
  setSceneTransform(id, sceneId, transform) {
    return import_electron.ipcRenderer.invoke("moviola:setSceneTransform", id, sceneId, transform);
  },
  setTextTracks(id, textTracks) {
    return import_electron.ipcRenderer.invoke("moviola:setTextTracks", id, textTracks);
  },
  setCaptions(id, captions) {
    return import_electron.ipcRenderer.invoke("moviola:setCaptions", id, captions);
  },
  setMusic(id, music) {
    return import_electron.ipcRenderer.invoke("moviola:setMusic", id, music);
  },
  setBrand(id, brand) {
    return import_electron.ipcRenderer.invoke("moviola:setBrand", id, brand);
  },
  setSceneColorBrightness(id, sceneId, colorBrightness) {
    return import_electron.ipcRenderer.invoke("moviola:setSceneColorBrightness", id, sceneId, colorBrightness);
  },
  colorAdjustmentEnabled() {
    return import_electron.ipcRenderer.invoke("moviola:colorAdjustmentEnabled");
  },
  splitScene(id, sceneId, atSeconds) {
    return import_electron.ipcRenderer.invoke("moviola:splitScene", id, sceneId, atSeconds);
  },
  undo(id) {
    return import_electron.ipcRenderer.invoke("moviola:undo", id);
  },
  redo(id) {
    return import_electron.ipcRenderer.invoke("moviola:redo", id);
  },
  ingestLocalVideo(id) {
    return import_electron.ipcRenderer.invoke("moviola:ingestLocalVideo", id);
  },
  trimClip(id, sceneId, startSeconds, durationSeconds) {
    return import_electron.ipcRenderer.invoke("moviola:trimClip", id, sceneId, startSeconds, durationSeconds);
  },
  setTranslation(id, sceneId, translation) {
    return import_electron.ipcRenderer.invoke("moviola:setTranslation", id, sceneId, translation);
  },
  dubNarration(id, url) {
    return import_electron.ipcRenderer.invoke("moviola:dubNarration", id, url);
  },
  searchStock(query) {
    return import_electron.ipcRenderer.invoke("moviola:searchStock", query);
  },
  insertStockScene(id, option) {
    return import_electron.ipcRenderer.invoke("moviola:insertStockScene", id, option);
  },
  generateAvatar(id, sceneId, url) {
    return import_electron.ipcRenderer.invoke("moviola:generateAvatar", id, sceneId, url);
  },
  fillFromSlides(id, slides) {
    return import_electron.ipcRenderer.invoke("moviola:fillFromSlides", id, slides);
  },
  removeBackground(id, sceneId) {
    return import_electron.ipcRenderer.invoke("moviola:removeBackground", id, sceneId);
  },
  auditScene(id, sceneId, score) {
    return import_electron.ipcRenderer.invoke("moviola:auditScene", id, sceneId, score);
  }
});
