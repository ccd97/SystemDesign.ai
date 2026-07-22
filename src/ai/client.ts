import type { TranscriptionSegment } from "../features/recorder/types";
import { arrayBufferToBase64 } from "../utils/utils";
import { GeminiLiveClient } from "./GeminiLiveClient";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

async function transcribeViaLive(
  apiKey: string,
  model: string,
  audioBlob: Blob,
): Promise<TranscriptionSegment[]> {
  return new Promise<TranscriptionSegment[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.disconnect();
      reject(new Error("Live transcription timed out"));
    }, 120_000);

    const segments: Array<{ startMs: number; endMs: number; text: string }> = [];
    let lastText = "";

    const client = new GeminiLiveClient(apiKey, model, {
      onSetupComplete: () => {
        const reader = audioBlob.stream().getReader();
        const pump = (): Promise<void> =>
          reader.read().then(({ done, value }) => {
            if (done) {
              setTimeout(() => client.sendTurnComplete(), 100);
              return Promise.resolve();
            }
            const b64 = arrayBufferToBase64(value.buffer);
            client.sendAudio(b64);
            return pump();
          });
        pump().catch(reject);
      },
      onTranscript: (text, _isFinal) => {
        lastText = text;
      },
      onTurnComplete: () => {
        clearTimeout(timeout);
        const text = lastText.trim();
        if (text) {
          segments.push({ startMs: 0, endMs: 0, text });
        }
        client.disconnect();
        resolve(segments);
      },
      onError: (err) => {
        clearTimeout(timeout);
        reject(new Error(err));
      },
      onClose: () => {},
    });

    client.connect();
  });
}

export async function transcribeAudio(
  apiKey: string,
  model: string,
  audioBlob: Blob,
): Promise<TranscriptionSegment[]> {
  try {
    return await transcribeViaLive(apiKey, model, audioBlob);
  } catch {
    // Fall back to REST
  }

  const base64 = await blobToBase64(audioBlob);
  const mimeType = audioBlob.type || "audio/webm";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(
      `${BASE_URL}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Transcribe this audio exactly. Break it into logical segments (roughly 5-15 seconds each, matching natural phrases or sentences). For each segment, provide the start and end time in seconds.

Rules:
- Transcribe the audio verbatim, including filler words (um, uh, etc.)
- Each segment should be a natural phrase or sentence
- Timestamps should be accurate to the nearest second`,
                },
                {
                  inlineData: {
                    mimeType,
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                segments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      startTimeSeconds: {
                        type: "number",
                        description: "Start time in seconds",
                      },
                      endTimeSeconds: {
                        type: "number",
                        description: "End time in seconds",
                      },
                      text: {
                        type: "string",
                        description: "Transcribed text for this segment",
                      },
                    },
                    required: ["startTimeSeconds", "endTimeSeconds", "text"],
                  },
                },
              },
              required: ["segments"],
            },
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Transcription failed (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      throw new Error("No transcription text in response");
    }

    const parsed = JSON.parse(text) as {
      segments?: Array<{ startTimeSeconds: number; endTimeSeconds: number; text: string }>;
    };

    if (parsed.segments && parsed.segments.length > 0) {
      return parsed.segments.map((s) => ({
        startMs: Math.round(s.startTimeSeconds * 1000),
        endMs: Math.round(s.endTimeSeconds * 1000),
        text: s.text.trim(),
      }));
    }

    return [{ startMs: 0, endMs: 0, text }];
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Transcription timed out after 2 minutes");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
