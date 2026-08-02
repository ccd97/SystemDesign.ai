import type { TranscriptionSegment } from "./types";
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
): Promise<TranscriptionSegment[]> {
  onStatusChange({ state: "running", sessionId });

  try {
    const segments = await transcribeAudio(apiKey, model, audioBlob);
    onStatusChange({ state: "done", sessionId, segments });
    return segments;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onStatusChange({ state: "error", sessionId, error: message });
    throw err;
  }
}
