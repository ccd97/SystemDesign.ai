import type { ExcalidrawElementData } from "../../../shared/types";

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
  elements: ExcalidrawElementData[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

export type CanvasTheme = "light" | "dark";

export function normalizeCanvasTheme(theme: unknown): CanvasTheme {
  return theme === "light" || theme === "dark" ? theme : "dark";
}
