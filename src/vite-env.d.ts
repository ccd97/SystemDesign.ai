/// <reference types="vite/client" />

import type { RecordingSession, RecordingSummary } from "./entities/recording";
import type { JudgeReport } from "./entities/recording";
import type { Settings } from "./entities/settings/model/types";
import type { CanvasMeta, CanvasIndex, ExcalidrawFile } from "./entities/canvas";

declare global {
  interface Window {
    canvasAPI: {
      list: () => Promise<CanvasIndex>;
      create: (name: string) => Promise<CanvasMeta>;
      load: (canvasId: string) => Promise<unknown>;
      save: (canvasId: string, data: ExcalidrawFile) => Promise<CanvasMeta | undefined>;
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
