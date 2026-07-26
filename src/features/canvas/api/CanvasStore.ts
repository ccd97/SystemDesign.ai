import { serializeAsJSON } from "@excalidraw/excalidraw";
import type { CanvasMeta, CanvasIndex, ExcalidrawFile, CanvasTheme } from "../../../entities/canvas";
import { normalizeCanvasTheme } from "../../../entities/canvas";
import type { ExcalidrawElementData } from "../../../shared/types";

export type { CanvasMeta, CanvasIndex, ExcalidrawFile, CanvasTheme };
export { normalizeCanvasTheme };

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

export async function saveCanvas(canvasId: string, data: ExcalidrawFile) {
  return window.canvasAPI.save(canvasId, data);
}

export function serializeCanvas(
  elements: readonly ExcalidrawElementData[],
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
