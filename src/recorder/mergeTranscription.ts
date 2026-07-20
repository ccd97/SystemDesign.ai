import type { InteractionEvent, TranscriptionSegment } from "./types";
import { loadRecording, saveRecording } from "./RecordingStore";

function mergeTranscriptionIntoEvents(
  events: InteractionEvent[],
  segments: TranscriptionSegment[],
  sessionStartedAt: string,
): InteractionEvent[] {
  const speechEvents: InteractionEvent[] = segments.map((segment) => ({
    seq: 0,
    action: "speech" as const,
    summary: segment.text,
    elapsedMs: segment.startMs,
    timestamp: new Date(new Date(sessionStartedAt).getTime() + segment.startMs).toISOString(),
  }));

  const merged = [...events, ...speechEvents].sort(
    (a, b) => (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0),
  );

  return merged.map((event, i) => ({ ...event, seq: i + 1 }));
}

export async function persistTranscription(
  canvasId: string,
  sessionId: string,
  segments: TranscriptionSegment[],
): Promise<void> {
  const session = await loadRecording(canvasId, sessionId);

  session.events = mergeTranscriptionIntoEvents(session.events, segments, session.startedAt);
  session.transcription = segments;
  session.hasAudio = true;
  session.eventCount = session.events.length;

  await saveRecording(canvasId, session);
}
