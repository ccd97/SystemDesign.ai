import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("canvasAPI", {
  list: () => ipcRenderer.invoke("canvas:list"),
  create: (name: string) => ipcRenderer.invoke("canvas:create", name),
  load: (canvasId: string) => ipcRenderer.invoke("canvas:load", canvasId),
  save: (canvasId: string, data: unknown) =>
    ipcRenderer.invoke("canvas:save", canvasId, data),
  rename: (canvasId: string, name: string) =>
    ipcRenderer.invoke("canvas:rename", canvasId, name),
  delete: (canvasId: string) => ipcRenderer.invoke("canvas:delete", canvasId),
});

contextBridge.exposeInMainWorld("recordingAPI", {
  list: (canvasId: string) => ipcRenderer.invoke("recording:list", canvasId),
  load: (canvasId: string, sessionId: string) =>
    ipcRenderer.invoke("recording:load", canvasId, sessionId),
  save: (canvasId: string, session: unknown) =>
    ipcRenderer.invoke("recording:save", canvasId, session),
  delete: (canvasId: string, sessionId: string) =>
    ipcRenderer.invoke("recording:delete", canvasId, sessionId),
});

contextBridge.exposeInMainWorld("recorderAPI", {
  export: (defaultPath: string, json: string) =>
    ipcRenderer.invoke("recorder:export", defaultPath, json),
});
