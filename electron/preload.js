import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("canvasAPI", {
    list: () => ipcRenderer.invoke("canvas:list"),
    create: (name) => ipcRenderer.invoke("canvas:create", name),
    load: (canvasId) => ipcRenderer.invoke("canvas:load", canvasId),
    save: (canvasId, data) => ipcRenderer.invoke("canvas:save", canvasId, data),
    rename: (canvasId, name) => ipcRenderer.invoke("canvas:rename", canvasId, name),
    delete: (canvasId) => ipcRenderer.invoke("canvas:delete", canvasId),
});
contextBridge.exposeInMainWorld("recordingAPI", {
    list: (canvasId) => ipcRenderer.invoke("recording:list", canvasId),
    load: (canvasId, sessionId) => ipcRenderer.invoke("recording:load", canvasId, sessionId),
    save: (canvasId, session) => ipcRenderer.invoke("recording:save", canvasId, session),
    delete: (canvasId, sessionId) => ipcRenderer.invoke("recording:delete", canvasId, sessionId),
});
contextBridge.exposeInMainWorld("recorderAPI", {
    export: (defaultPath, json) => ipcRenderer.invoke("recorder:export", defaultPath, json),
});
