import type { ChatbotMessage, ExcalidrawElementData, TranscriptionSegment } from "../../../shared/types";

export type { ChatbotMessage, TranscriptionSegment };

export type JudgeDimension = {
  name: string;
  score: number;
  observations: string[];
};

export type JudgeReport = {
  sessionId: string;
  model: string;
  judgedAt: string;
  dimensions: JudgeDimension[];
  overallScore: number;
  strengths: string[];
  improvements: string[];
};

export type JudgeStatus =
  | { state: "idle" }
  | { state: "running"; sessionId: string }
  | { state: "done"; sessionId: string; report: JudgeReport }
  | { state: "error"; sessionId: string; error: string };

export type RecordedAction =
  | "element_created"
  | "element_deleted"
  | "element_moved"
  | "element_resized"
  | "element_rotated"
  | "element_restyled"
  | "element_reshaped"
  | "text_edited"
  | "scene_cleared"
  | "speech"
  | "question_generated"
  | "candidate_question"
  | "interviewer_response";

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
  app: "system-design-ai";
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
    elements: ExcalidrawElementData[];
    appState?: {
      viewBackgroundColor: string;
      theme?: string;
    };
  };
  question?: string;
  narrative?: string;
  hasAudio?: boolean;
  audioMimeType?: string;
  transcription?: TranscriptionSegment[];
  chatHistory?: ChatbotMessage[];
};

export type RecordingSummary = Pick<
  RecordingSession,
  "sessionId" | "canvasId" | "canvasName" | "startedAt" | "endedAt" | "durationMs" | "eventCount"
> & {
  hasAudio?: boolean;
  hasTranscription?: boolean;
};
