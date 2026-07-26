import type { TranscriptionSegment } from "./types";
import type { AudioChunk } from "../../../shared/lib/audio/AudioRecorder";
import { transcribeAudio } from "../../../shared/lib/gemini";

export type TranscriptionStatus =
  | { state: "idle" }
  | { state: "running"; sessionId: string }
  | { state: "done"; sessionId: string; segments: TranscriptionSegment[] }
  | { state: "error"; sessionId: string; error: string };

export async function runTranscription(
  apiKey: string,
  model: string,
  audioBlob: Blob,
  sessionId: string,
  onStatusChange: (status: TranscriptionStatus) => void,
  audioChunks?: AudioChunk[],
): Promise<TranscriptionSegment[]> {
  onStatusChange({ state: "running", sessionId });

  try {
    let segments: TranscriptionSegment[];

    if (audioChunks && audioChunks.length > 1) {
      const merged: TranscriptionSegment[] = [];
      const promises = audioChunks.map((chunk, index) =>
        transcribeAudio(apiKey, model, chunk.blob).then((chunkSegments) =>
          chunkSegments.map((s) => ({
            ...s,
            startMs: s.startMs + chunk.startMs,
            endMs: s.endMs + chunk.startMs,
          })),
        ),
      );
      const results = await Promise.all(promises);
      for (const result of results) {
        merged.push(...result);
      }
      segments = merged.sort((a, b) => a.startMs - b.startMs);
    } else {
      segments = await transcribeAudio(apiKey, model, audioBlob);
    }

    onStatusChange({ state: "done", sessionId, segments });
    return segments;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onStatusChange({ state: "error", sessionId, error: message });
    throw err;
  }
}
