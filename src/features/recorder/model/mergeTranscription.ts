import type { InteractionEvent, TranscriptionSegment } from "./types";
import { loadRecording, saveRecording } from "./RecordingStore";

function mergeTranscriptionIntoEvents(
  events: InteractionEvent[],
  segments: TranscriptionSegment[],
  sessionStartedAt: string,
): InteractionEvent[] {
  const validSegments = segments
    .filter((s) => typeof s.startMs === "number" && !Number.isNaN(s.startMs))
    .sort((a, b) => a.startMs - b.startMs);

  const speechEvents: InteractionEvent[] = validSegments.map((segment) => {
    const startMs = Math.max(0, Math.round(segment.startMs));
    return {
      seq: 0,
      action: "speech" as const,
      summary: segment.text,
      elapsedMs: startMs,
      timestamp: new Date(new Date(sessionStartedAt).getTime() + startMs).toISOString(),
    };
  });

  const nonSpeechEvents = events.filter((e) => e.action !== "speech");
  const merged = [...nonSpeechEvents, ...speechEvents].sort(
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
