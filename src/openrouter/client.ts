import type { TranscriptionSegment } from "../recorder/types";

const BASE_URL = "https://openrouter.ai/api/v1";

type OpenRouterHeaders = {
  Authorization: string;
  "Content-Type": string;
  "HTTP-Referer": string;
  "X-Title": string;
};

function makeHeaders(apiKey: string): OpenRouterHeaders {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://excalidraw-recorder.local",
    "X-Title": "Excalidraw Recorder",
  };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const chunkSize = 8192;
  const bytes = new Uint8Array(buffer);
  let result = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    result += btoa(String.fromCharCode(...chunk));
  }
  return result;
}

const STT_MODELS = ["openai/whisper", "openai/gpt-4o-transcribe", "openai/gpt-4o-mini-transcribe"];

function isSttModel(model: string): boolean {
  return STT_MODELS.some((prefix) => model.startsWith(prefix));
}

const SEGMENT_RE = /\[(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2})\.(\d{3})\]\s*(.*)/;

function parseTimestampedSegments(text: string): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];
  for (const line of text.split("\n")) {
    const match = line.trim().match(SEGMENT_RE);
    if (!match) continue;
    const [, startMin, startSec, startMs, endMin, endSec, endMs, content] = match;
    if (!content.trim()) continue;
    segments.push({
      startMs: Number(startMin) * 60_000 + Number(startSec) * 1000 + Number(startMs),
      endMs: Number(endMin) * 60_000 + Number(endSec) * 1000 + Number(endMs),
      text: content.trim(),
    });
  }
  if (segments.length === 0) {
    return [{ startMs: 0, endMs: 0, text }];
  }
  return segments;
}

async function transcribeWithStt(
  apiKey: string,
  model: string,
  base64: string,
  format: string,
  signal: AbortSignal,
): Promise<TranscriptionSegment[]> {
  const response = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: makeHeaders(apiKey),
    body: JSON.stringify({
      model,
      input_audio: { data: base64, format },
    }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Transcription failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();

  if (data.segments && Array.isArray(data.segments)) {
    return data.segments.map((s: { start: number; end: number; text: string }) => ({
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      text: s.text.trim(),
    }));
  }

  return [{ startMs: 0, endMs: 0, text: data.text }];
}

async function transcribeWithChatCompletion(
  apiKey: string,
  model: string,
  base64: string,
  format: string,
  signal: AbortSignal,
): Promise<TranscriptionSegment[]> {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: makeHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: { data: base64, format },
            },
            {
              type: "text",
              text: `Transcribe this audio exactly. Output timestamped segments in this exact format, one per line:

[MM:SS.mmm --> MM:SS.mmm] transcribed text here

Rules:
- Use MM:SS.mmm format (minutes, seconds, milliseconds)
- Each segment should be a natural phrase or sentence (roughly 5-15 seconds each)
- Start at 00:00.000
- Do NOT output anything else — no labels, no commentary, no extra formatting
- Transcribe the audio verbatim, including filler words (um, uh, etc.)`,
            },
          ],
        },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Transcription failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data.choices[0].message.content.trim();
  return parseTimestampedSegments(text);
}

export async function transcribeAudio(
  apiKey: string,
  model: string,
  audioBlob: Blob,
): Promise<TranscriptionSegment[]> {
  const base64 = await blobToBase64(audioBlob);

  let format: string;
  switch (audioBlob.type) {
    case "audio/webm":
      format = "webm";
      break;
    case "audio/ogg":
      format = "ogg";
      break;
    case "audio/wav":
      format = "wav";
      break;
    default:
      format = "webm";
      break;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    if (isSttModel(model)) {
      return await transcribeWithStt(apiKey, model, base64, format, controller.signal);
    }
    return await transcribeWithChatCompletion(apiKey, model, base64, format, controller.signal);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Transcription timed out after 2 minutes");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
