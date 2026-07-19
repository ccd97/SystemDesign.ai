import type { TranscriptionSegment } from "../recorder/types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < slice.length; j++) {
      binary += String.fromCharCode(slice[j]);
    }
  }
  return btoa(binary);
}

export async function transcribeAudio(
  apiKey: string,
  model: string,
  audioBlob: Blob,
): Promise<TranscriptionSegment[]> {
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
