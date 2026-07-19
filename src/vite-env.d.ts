/// <reference types="vite/client" />

import type { RecordingSession, RecordingSummary } from "./recorder/types";
import type { JudgeReport } from "./judge/types";
import type { Settings } from "./settings/types";

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
      saveAudio: (canvasId: string, sessionId: string, buffer: ArrayBuffer) => Promise<void>;
      loadAudio: (canvasId: string, sessionId: string) => Promise<ArrayBuffer | null>;
      saveJudge: (canvasId: string, sessionId: string, report: JudgeReport) => Promise<void>;
      loadJudge: (canvasId: string, sessionId: string) => Promise<JudgeReport | null>;
    };
    recorderAPI: {
      export: (
        defaultPath: string,
        json: string,
      ) => Promise<{ canceled: boolean; filePath?: string }>;
    };
    settingsAPI: {
      load: () => Promise<Settings>;
      save: (settings: Settings) => Promise<void>;
    };
  }
}

export {};
