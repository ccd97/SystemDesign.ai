/// <reference types="vite/client" />

import type { RecordingSession, RecordingSummary } from "./recorder/types";

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

declare global {
  interface Window {
    canvasAPI: {
      list: () => Promise<CanvasIndex>;
      create: (name: string) => Promise<CanvasMeta>;
      load: (canvasId: string) => Promise<unknown>;
      save: (canvasId: string, data: unknown) => Promise<CanvasMeta | undefined>;
      rename: (canvasId: string, name: string) => Promise<CanvasMeta | undefined>;
      delete: (canvasId: string) => Promise<CanvasIndex>;
    };
    recordingAPI: {
      list: (canvasId: string) => Promise<RecordingSummary[]>;
      load: (canvasId: string, sessionId: string) => Promise<RecordingSession>;
      save: (canvasId: string, session: RecordingSession) => Promise<RecordingSummary[]>;
      delete: (canvasId: string, sessionId: string) => Promise<RecordingSummary[]>;
    };
    recorderAPI: {
      export: (
        defaultPath: string,
        json: string,
      ) => Promise<{ canceled: boolean; filePath?: string }>;
    };
  }
}

export {};
