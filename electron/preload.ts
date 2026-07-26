import { contextBridge, ipcRenderer } from "electron";
import type { ExcalidrawFile } from "../src/entities/canvas/model/types";
import type { RecordingSession, JudgeReport } from "../src/entities/recording/model/types";
import type { Settings } from "../src/entities/settings/model/types";

contextBridge.exposeInMainWorld("canvasAPI", {
  list: () => ipcRenderer.invoke("canvas:list"),
  create: (name: string) => ipcRenderer.invoke("canvas:create", name),
  load: (canvasId: string) => ipcRenderer.invoke("canvas:load", canvasId),
  save: (canvasId: string, data: ExcalidrawFile) =>
    ipcRenderer.invoke("canvas:save", canvasId, data),
  rename: (canvasId: string, name: string) =>
    ipcRenderer.invoke("canvas:rename", canvasId, name),
  delete: (canvasId: string) => ipcRenderer.invoke("canvas:delete", canvasId),
});

contextBridge.exposeInMainWorld("recordingAPI", {
  list: (canvasId: string) => ipcRenderer.invoke("recording:list", canvasId),
  load: (canvasId: string, sessionId: string) =>
    ipcRenderer.invoke("recording:load", canvasId, sessionId),
  save: (canvasId: string, session: RecordingSession) =>
    ipcRenderer.invoke("recording:save", canvasId, session),
  delete: (canvasId: string, sessionId: string) =>
    ipcRenderer.invoke("recording:delete", canvasId, sessionId),
  saveAudio: (canvasId: string, sessionId: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke("recording:save-audio", canvasId, sessionId, buffer),
  loadAudio: (canvasId: string, sessionId: string) =>
    ipcRenderer.invoke("recording:load-audio", canvasId, sessionId),
  saveJudge: (canvasId: string, sessionId: string, report: JudgeReport) =>
    ipcRenderer.invoke("recording:save-judge", canvasId, sessionId, report),
  loadJudge: (canvasId: string, sessionId: string) =>
    ipcRenderer.invoke("recording:load-judge", canvasId, sessionId),
});

contextBridge.exposeInMainWorld("settingsAPI", {
  load: () => ipcRenderer.invoke("settings:load"),
  save: (settings: Settings) => ipcRenderer.invoke("settings:save", settings),
});

contextBridge.exposeInMainWorld("recorderAPI", {
  export: (defaultPath: string, json: string) =>
    ipcRenderer.invoke("recorder:export", defaultPath, json),
});
