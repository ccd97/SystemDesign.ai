import type { TranscriptionSegment } from "../../types";
import { arrayBufferToBase64 } from "../../utils/utils";
import { GeminiLiveClient } from "../ai/GeminiLiveClient";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const LIVE_SAMPLE_RATE = 16000;
const PCM_SAMPLES_PER_CHUNK = (LIVE_SAMPLE_RATE * 3000) / 1000; // 3000ms chunks

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

async function decodeToPcm16(blob: Blob): Promise<Int16Array> {
  const ctx = new OfflineAudioContext(1, 1, LIVE_SAMPLE_RATE);
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  const raw = audioBuffer.getChannelData(0);
  const pcm = new Int16Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const s = Math.max(-1, Math.min(1, raw[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcm;
}

function pcmToBase64(pcm: Int16Array): string {
  const buf = pcm.buffer as ArrayBuffer;
  return arrayBufferToBase64(buf.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
}

async function transcribeViaLive(
  apiKey: string,
  model: string,
  audioBlob: Blob,
): Promise<TranscriptionSegment[]> {
  const pcm = await decodeToPcm16(audioBlob);

  if (pcm.length === 0) {
    return [];
  }

  const durationSec = Math.max(1, pcm.length / LIVE_SAMPLE_RATE);

  return new Promise<TranscriptionSegment[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.disconnect();
      reject(new Error("Live transcription timed out"));
    }, 120_000);

    let finishTimeout: ReturnType<typeof setTimeout> | null = null;
    let accumulatedText = "";
    let settled = false;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (finishTimeout) clearTimeout(finishTimeout);
      client.disconnect();

      const text = accumulatedText.trim();
      if (!text) {
        resolve([]);
        return;
      }

      // 1. Attempt regex extraction of JSON array
      const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as Array<{
            text?: string;
            startTimeSeconds?: number;
            endTimeSeconds?: number;
          }>;

          if (Array.isArray(parsed) && parsed.length > 0) {
            const segments = parsed
              .map((s) => ({
                startMs: Math.max(0, Math.round(Number(s.startTimeSeconds ?? 0) * 1000)),
                endMs: Math.max(0, Math.round(Number(s.endTimeSeconds ?? 0) * 1000)),
                text: String(s.text ?? "").trim(),
              }))
              .filter((s) => s.text.length > 0)
              .sort((a, b) => a.startMs - b.startMs);

            if (segments.length > 0) {
              resolve(segments);
              return;
            }
          }
        } catch {
          // fall through to sentence distribution
        }
      }

      // 2. Fallback: Split raw text into natural sentences & distribute across duration
      const sentences = text
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (sentences.length === 0) {
        resolve([{ startMs: 0, endMs: Math.round(durationSec * 1000), text }]);
        return;
      }

      const totalChars = sentences.reduce((acc, s) => acc + s.length, 0);
      let currentOffsetMs = 0;

      const segments = sentences.map((sentence) => {
        const fraction = totalChars > 0 ? sentence.length / totalChars : 1 / sentences.length;
        const segmentDurationMs = Math.max(1000, Math.round(fraction * durationSec * 1000));
        const startMs = currentOffsetMs;
        const endMs = Math.min(Math.round(durationSec * 1000), startMs + segmentDurationMs);
        currentOffsetMs = endMs;
        return {
          startMs,
          endMs,
          text: sentence,
        };
      });

      resolve(segments);
    };

    const client = new GeminiLiveClient(
      apiKey,
      model,
      {
        onSetupComplete: () => {
          const prompt = `Transcribe this audio recording verbatim.
Break it into short logical sentences/phrases (3 to 15 seconds long).
For each segment, provide:
- "startTimeSeconds": start time in seconds relative to 0.0s (start of audio).
- "endTimeSeconds": end time in seconds relative to 0.0s (start of audio).
- "text": verbatim spoken words.

Output ONLY a JSON array of segment objects in this exact format with no extra markdown:
[
  { "text": "Sentence one.", "startTimeSeconds": 0.0, "endTimeSeconds": 3.0 },
  { "text": "Sentence two.", "startTimeSeconds": 3.0, "endTimeSeconds": 7.5 }
]`;
          client.sendTurn(prompt, pcmToBase64(pcm));
        },
        onModelTranscript: (text) => {
          if (text) {
            accumulatedText += text;
          }
          if (finishTimeout) clearTimeout(finishTimeout);
          finishTimeout = setTimeout(finish, 3000);
        },
        onTurnComplete: () => {
          finish();
        },
        onError: (err) => {
          clearTimeout(timeout);
          if (finishTimeout) clearTimeout(finishTimeout);
          reject(new Error(err));
        },
      },
    );

    client.connect();
  });
}

export async function transcribeAudio(
  apiKey: string,
  model: string,
  audioBlob: Blob,
): Promise<TranscriptionSegment[]> {
  if (audioBlob.size < 1024) {
    return [];
  }

  try {
    return await transcribeViaLive(apiKey, model, audioBlob);
  } catch (err) {
    console.warn("Live API transcription failed, falling back to REST:", err);
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
                  text: `Transcribe this audio recording accurately.
Break the transcription into distinct speech segments matching natural phrases or sentences (each segment around 3 to 15 seconds long).

For each segment, provide:
- startTimeSeconds: the exact timestamp in seconds from the start of the audio file (0.0s) where this segment begins.
- endTimeSeconds: the exact timestamp in seconds from the start of the audio file (0.0s) where this segment ends.
- text: the exact verbatim text spoken in this segment.

Rules:
- Timestamps must start relative to 0.0 seconds at the beginning of the audio.
- Timestamps must strictly increase chronologically.
- Do not compress all timestamps to the end of the recording.`,
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
                        description: "Start time in seconds from 0.0",
                      },
                      endTimeSeconds: {
                        type: "number",
                        description: "End time in seconds from 0.0",
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
      return parsed.segments
        .map((s) => ({
          startMs: Math.max(0, Math.round((s.startTimeSeconds ?? 0) * 1000)),
          endMs: Math.max(0, Math.round((s.endTimeSeconds ?? 0) * 1000)),
          text: (s.text ?? "").trim(),
        }))
        .filter((s) => s.text.length > 0)
        .sort((a, b) => a.startMs - b.startMs);
    }

    return [];
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Transcription timed out after 2 minutes");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
