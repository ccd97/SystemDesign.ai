import type { RecordingSession, RecordingSummary } from "./types";

export async function listRecordings(canvasId: string): Promise<RecordingSummary[]> {
  return window.recordingAPI.list(canvasId);
}

export async function loadRecording(canvasId: string, sessionId: string) {
  return window.recordingAPI.load(canvasId, sessionId);
}

export async function saveRecording(canvasId: string, session: RecordingSession) {
  return window.recordingAPI.save(canvasId, session);
}

export async function deleteRecording(canvasId: string, sessionId: string) {
  return window.recordingAPI.delete(canvasId, sessionId);
}

export function recordingFilename(session: Pick<RecordingSession, "sessionId" | "startedAt">) {
  const date = session.startedAt.replaceAll(":", "-").replaceAll(".", "-");
  return `excalidraw-recording-${date}-${session.sessionId}.json`;
}

export function sessionToJson(session: RecordingSession) {
  return JSON.stringify(session, null, 2);
}
