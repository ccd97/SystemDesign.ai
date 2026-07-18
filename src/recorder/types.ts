export type RecordedAction =
  | "element_created"
  | "element_deleted"
  | "element_moved"
  | "element_resized"
  | "element_rotated"
  | "element_restyled"
  | "element_reshaped"
  | "text_edited"
  | "scene_cleared";

export type EventChanges = Record<string, { from: unknown; to: unknown }>;

export type InteractionEvent = {
  seq: number;
  timestamp?: string;
  elapsedMs?: number;
  action: RecordedAction;
  summary: string;
  elementId?: string;
  elementType?: string;
  snapshot?: Record<string, unknown>;
};

export type RecordingSession = {
  schemaVersion: string;
  app: "excalidraw-recorder";
  sessionId: string;
  canvasId: string;
  canvasName: string;
  name?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  eventCount: number;
  events: InteractionEvent[];
  finalScene: {
    elements: unknown[];
    appState?: {
      viewBackgroundColor: string;
      theme?: string;
    };
  };
  narrative?: string;
};

export type RecordingSummary = Pick<
  RecordingSession,
  "sessionId" | "canvasId" | "canvasName" | "startedAt" | "endedAt" | "durationMs" | "eventCount"
>;
