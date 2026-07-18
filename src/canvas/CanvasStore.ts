import { serializeAsJSON } from "@excalidraw/excalidraw";

export type CanvasMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type CanvasIndex = {
  lastActiveId?: string;
  canvases: CanvasMeta[];
};

export type ExcalidrawFile = {
  type: "excalidraw";
  version?: number;
  source?: string;
  elements: readonly unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

export type CanvasTheme = "light" | "dark";

export function normalizeCanvasTheme(theme: unknown): CanvasTheme {
  return theme === "light" || theme === "dark" ? theme : "dark";
}

function withTheme(appState: Record<string, unknown> | undefined) {
  return {
    ...(appState ?? {}),
    theme: normalizeCanvasTheme(appState?.theme),
  };
}

export async function listCanvases() {
  return window.canvasAPI.list();
}

export async function createCanvas(name: string) {
  return window.canvasAPI.create(name);
}

export async function renameCanvas(canvasId: string, name: string) {
  return window.canvasAPI.rename(canvasId, name);
}

export async function deleteCanvas(canvasId: string) {
  return window.canvasAPI.delete(canvasId);
}

export async function loadCanvas(canvasId: string): Promise<ExcalidrawFile> {
  const data = (await window.canvasAPI.load(canvasId)) as Partial<ExcalidrawFile>;
  return {
    type: "excalidraw",
    elements: Array.isArray(data.elements) ? data.elements : [],
    appState: withTheme(data.appState),
    files: data.files ?? {},
    version: data.version,
    source: data.source,
  };
}

export async function saveCanvas(canvasId: string, data: unknown) {
  return window.canvasAPI.save(canvasId, data);
}

export function serializeCanvas(
  elements: readonly unknown[],
  appState: Record<string, unknown>,
  files: Record<string, unknown>,
) {
  const serialized = JSON.parse(
    serializeAsJSON(elements as never, appState as never, files as never, "local"),
  ) as ExcalidrawFile;
  serialized.appState = withTheme({
    ...(serialized.appState ?? {}),
    theme: appState.theme,
  });
  return serialized;
}
