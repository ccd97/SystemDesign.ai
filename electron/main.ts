import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultSettings } from "../src/settings/types";

type CanvasMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type CanvasIndex = {
  lastActiveId?: string;
  canvases: CanvasMeta[];
};

type RecordingSummary = {
  sessionId: string;
  canvasId: string;
  canvasName: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  eventCount: number;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const blankExcalidrawFile = () => ({
  type: "excalidraw",
  version: 2,
  source: "excalidraw-recorder",
  elements: [],
  appState: {
    theme: "dark",
    viewBackgroundColor: "#ffffff",
  },
  files: {},
});

type Settings = {
  openRouterApiKey: string;
  geminiApiKey: string;
  audioModel: string;
  smartModel: string;
  fastModel: string;
  enableAudioRecording: boolean;
  enableJudge: boolean;
  enableQuestionGen: boolean;
  enableChatbot: boolean;
};

const settingsPath = () => path.join(app.getPath("userData"), "settings.json");

async function readSettings(): Promise<Settings> {
  await ensureStorage();
  if (!existsSync(settingsPath())) {
    return defaultSettings;
  }
  try {
    const raw = await readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

async function writeSettings(settings: Settings): Promise<void> {
  await ensureStorage();
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

const canvasesRoot = () => path.join(app.getPath("userData"), "canvases");
const indexPath = () => path.join(canvasesRoot(), "index.json");
const canvasDir = (canvasId: string) => path.join(canvasesRoot(), canvasId);
const canvasFile = (canvasId: string) => path.join(canvasDir(canvasId), "canvas.excalidraw");
const recordingsDir = (canvasId: string) => path.join(canvasDir(canvasId), "recordings");
const recordingFile = (canvasId: string, sessionId: string) =>
  path.join(recordingsDir(canvasId), `${sessionId}.json`);
const audioFile = (canvasId: string, sessionId: string) =>
  path.join(recordingsDir(canvasId), `${sessionId}.webm`);
const judgeFile = (canvasId: string, sessionId: string) =>
  path.join(recordingsDir(canvasId), `${sessionId}.judge.json`);

async function ensureStorage() {
  await mkdir(canvasesRoot(), { recursive: true });
}

async function readIndex(): Promise<CanvasIndex> {
  await ensureStorage();
  if (!existsSync(indexPath())) {
    return { canvases: [] };
  }

  try {
    const raw = await readFile(indexPath(), "utf8");
    const parsed = JSON.parse(raw) as CanvasIndex;
    return {
      canvases: Array.isArray(parsed.canvases) ? parsed.canvases : [],
      lastActiveId: parsed.lastActiveId,
    };
  } catch {
    return { canvases: [] };
  }
}

async function writeIndex(index: CanvasIndex) {
  await ensureStorage();
  await writeFile(indexPath(), JSON.stringify(index, null, 2), "utf8");
}

async function updateCanvasMeta(
  canvasId: string,
  updater: (canvas: CanvasMeta) => CanvasMeta,
): Promise<CanvasMeta | undefined> {
  const index = await readIndex();
  let updated: CanvasMeta | undefined;
  index.canvases = index.canvases.map((canvas) => {
    if (canvas.id !== canvasId) {
      return canvas;
    }
    updated = updater(canvas);
    return updated;
  });
  await writeIndex(index);
  return updated;
}

async function createCanvas(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Canvas name is required.");
  }

  const index = await readIndex();
  const now = new Date().toISOString();
  const canvas: CanvasMeta = {
    id: randomUUID(),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  };

  await mkdir(recordingsDir(canvas.id), { recursive: true });
  await writeFile(canvasFile(canvas.id), JSON.stringify(blankExcalidrawFile(), null, 2), "utf8");

  index.canvases.push(canvas);
  index.lastActiveId = canvas.id;
  await writeIndex(index);
  return canvas;
}

async function listCanvases() {
  const index = await readIndex();
  return index;
}

async function loadCanvas(canvasId: string) {
  if (!existsSync(canvasFile(canvasId))) {
    await mkdir(recordingsDir(canvasId), { recursive: true });
    await writeFile(canvasFile(canvasId), JSON.stringify(blankExcalidrawFile(), null, 2), "utf8");
  }

  const raw = await readFile(canvasFile(canvasId), "utf8");
  const index = await readIndex();
  index.lastActiveId = canvasId;
  await writeIndex(index);
  return JSON.parse(raw);
}

async function saveCanvas(canvasId: string, data: unknown) {
  const now = new Date().toISOString();
  await mkdir(recordingsDir(canvasId), { recursive: true });
  await writeFile(canvasFile(canvasId), JSON.stringify(data, null, 2), "utf8");

  const index = await readIndex();
  index.canvases = index.canvases.map((canvas) =>
    canvas.id === canvasId ? { ...canvas, updatedAt: now } : canvas,
  );
  index.lastActiveId = canvasId;
  await writeIndex(index);
  return index.canvases.find((canvas) => canvas.id === canvasId);
}

async function renameCanvas(canvasId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Canvas name is required.");
  }
  return updateCanvasMeta(canvasId, (canvas) => ({
    ...canvas,
    name: trimmed,
    updatedAt: new Date().toISOString(),
  }));
}

async function deleteCanvas(canvasId: string) {
  const index = await readIndex();
  const nextCanvases = index.canvases.filter((canvas) => canvas.id !== canvasId);
  await rm(canvasDir(canvasId), { recursive: true, force: true });
  await writeIndex({
    canvases: nextCanvases,
    lastActiveId:
      index.lastActiveId === canvasId ? nextCanvases[0]?.id : index.lastActiveId,
  });
  return listCanvases();
}

async function listRecordings(canvasId: string): Promise<RecordingSummary[]> {
  await mkdir(recordingsDir(canvasId), { recursive: true });
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(recordingsDir(canvasId), { withFileTypes: true });
  const results = await Promise.allSettled(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !entry.name.includes(".judge."))
      .map(async (entry) => {
        const raw = await readFile(path.join(recordingsDir(canvasId), entry.name), "utf8");
        const session = JSON.parse(raw) as RecordingSummary;
        return {
          sessionId: session.sessionId,
          canvasId,
          canvasName: session.canvasName,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          durationMs: session.durationMs,
          eventCount: session.eventCount,
        };
      }),
  );
  const summaries = results
    .filter((r): r is PromiseFulfilledResult<RecordingSummary> => r.status === "fulfilled")
    .map((r) => r.value);
  return summaries.sort(
    (left, right) =>
      new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
  );
}

async function loadRecording(canvasId: string, sessionId: string) {
  const raw = await readFile(recordingFile(canvasId, sessionId), "utf8");
  return JSON.parse(raw);
}

async function saveRecording(canvasId: string, session: { sessionId: string }) {
  await mkdir(recordingsDir(canvasId), { recursive: true });
  await writeFile(
    recordingFile(canvasId, session.sessionId),
    JSON.stringify(session, null, 2),
    "utf8",
  );
  return listRecordings(canvasId);
}

async function saveJudge(canvasId: string, sessionId: string, report: unknown): Promise<void> {
  await mkdir(recordingsDir(canvasId), { recursive: true });
  await writeFile(judgeFile(canvasId, sessionId), JSON.stringify(report, null, 2), "utf8");
}

async function loadJudge(canvasId: string, sessionId: string): Promise<unknown | null> {
  const filePath = judgeFile(canvasId, sessionId);
  if (!existsSync(filePath)) return null;
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function deleteRecording(canvasId: string, sessionId: string) {
  await rm(recordingFile(canvasId, sessionId), { force: true });
  await rm(audioFile(canvasId, sessionId), { force: true });
  await rm(judgeFile(canvasId, sessionId), { force: true });
  return listRecordings(canvasId);
}

async function saveAudio(canvasId: string, sessionId: string, buffer: ArrayBuffer) {
  await mkdir(recordingsDir(canvasId), { recursive: true });
  await writeFile(audioFile(canvasId, sessionId), Buffer.from(buffer));
}

async function loadAudio(canvasId: string, sessionId: string): Promise<ArrayBuffer | null> {
  const filePath = audioFile(canvasId, sessionId);
  if (!existsSync(filePath)) return null;
  const buf = await readFile(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function exportJson(defaultPath: string, json: string) {
  const result = await dialog.showSaveDialog({
    title: "Export recording",
    defaultPath,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await writeFile(result.filePath, json, "utf8");
  return { canceled: false, filePath: result.filePath };
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#111827",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  ipcMain.handle("settings:load", readSettings);
  ipcMain.handle("settings:save", (_event, settings: Settings) => writeSettings(settings));

  ipcMain.handle("canvas:list", listCanvases);
  ipcMain.handle("canvas:create", (_event, name: string) => createCanvas(name));
  ipcMain.handle("canvas:load", (_event, canvasId: string) => loadCanvas(canvasId));
  ipcMain.handle("canvas:save", (_event, canvasId: string, data: unknown) =>
    saveCanvas(canvasId, data),
  );
  ipcMain.handle("canvas:rename", (_event, canvasId: string, name: string) =>
    renameCanvas(canvasId, name),
  );
  ipcMain.handle("canvas:delete", (_event, canvasId: string) => deleteCanvas(canvasId));

  ipcMain.handle("recording:list", (_event, canvasId: string) => listRecordings(canvasId));
  ipcMain.handle("recording:load", (_event, canvasId: string, sessionId: string) =>
    loadRecording(canvasId, sessionId),
  );
  ipcMain.handle("recording:save", (_event, canvasId: string, session: { sessionId: string }) =>
    saveRecording(canvasId, session),
  );
  ipcMain.handle("recording:delete", (_event, canvasId: string, sessionId: string) =>
    deleteRecording(canvasId, sessionId),
  );
  ipcMain.handle("recording:save-audio", (_event, canvasId: string, sessionId: string, buffer: ArrayBuffer) =>
    saveAudio(canvasId, sessionId, buffer),
  );
  ipcMain.handle("recording:load-audio", (_event, canvasId: string, sessionId: string) =>
    loadAudio(canvasId, sessionId),
  );
  ipcMain.handle("recorder:export", (_event, defaultPath: string, json: string) =>
    exportJson(defaultPath, json),
  );

  ipcMain.handle("recording:save-judge", (_event, canvasId: string, sessionId: string, report: unknown) =>
    saveJudge(canvasId, sessionId, report),
  );
  ipcMain.handle("recording:load-judge", (_event, canvasId: string, sessionId: string) =>
    loadJudge(canvasId, sessionId),
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
