# Part A — Audio Recording & Transcription

Record audio alongside Excalidraw interactions, transcribe via OpenRouter, merge timestamped transcript into events.

---

## Overview

When the user clicks Record, the app captures microphone audio in parallel with canvas events. On stop, the audio blob is persisted alongside the session JSON. An async background job sends the audio to an OpenRouter transcription model (configurable in settings), receives timestamped segments, and merges them into the recording's event list. The RecordingDetail dialog gains an audio playback control.

---

## Settings Infrastructure

All new features across parts A–D share a single settings system. Build it here; later parts add their own fields.

### New files

#### `src/settings/types.ts`

```ts
export type Settings = {
  openRouterApiKey: string;
  audioModel: string;
  smartModel: string;
  fastModel: string;
  enableAudioRecording: boolean;
  enableJudge: boolean;
  enableQuestionGen: boolean;
  enableChatbot: boolean;
};
```

Default values (hardcoded constant, not dynamic):

| Field | Default |
|---|---|
| `openRouterApiKey` | `""` |
| `audioModel` | `"openai/whisper-large-v3"` |
| `smartModel` | `"openai/gpt-4o"` |
| `fastModel` | `"openai/gpt-4o-mini"` |
| `enableAudioRecording` | `true` |
| `enableJudge` | `true` |
| `enableQuestionGen` | `true` |
| `enableChatbot` | `true` |

#### `src/settings/SettingsStore.ts`

Thin wrapper over a new `window.settingsAPI` (Electron IPC) that reads/writes a single `settings.json` in `app.getPath("userData")`.

Exposed methods:

```ts
export async function loadSettings(): Promise<Settings>
export async function saveSettings(settings: Settings): Promise<void>
```

#### `src/settings/SettingsContext.tsx`

React context providing `settings` and `updateSettings(patch)` to the entire tree. Loaded once on boot inside `App.tsx` (similar to how canvases are loaded today). The context value is memoized.

#### `src/components/SettingsDialog.tsx`

A dialog (Radix `Dialog`) opened via a gear icon button added to the top-bar next to the theme toggle. Sections:

1. **API Key** — password-type input for `openRouterApiKey`.
2. **Models** — three text inputs for `audioModel`, `smartModel`, `fastModel`. Each has a small muted label explaining its purpose (e.g. "Audio transcription model").
3. **Feature Toggles** — four toggle switches (styled as compact buttons, not native checkboxes) for `enableAudioRecording`, `enableJudge`, `enableQuestionGen`, `enableChatbot`. Each toggle visually shows on/off state.
4. **Save** button that calls `saveSettings` and closes the dialog.

Style the dialog at `min-width: 480px` using the existing `.ui-dialog-content` pattern, extended with a `.settings-dialog` class. Use the existing design system tokens (HSL vars, `.ui-input`, `.ui-button`).

### Electron IPC additions

In `electron/main.ts`, add:

```ts
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");

async function readSettings(): Promise<Settings> {
  // read file, parse JSON, merge with defaults, return
}

async function writeSettings(settings: Settings): Promise<void> {
  // stringify + writeFile
}
```

Register two new handles:

```
ipcMain.handle("settings:load", readSettings)
ipcMain.handle("settings:save", (_event, settings) => writeSettings(settings))
```

In `electron/preload.ts`, expose:

```ts
contextBridge.exposeInMainWorld("settingsAPI", {
  load: () => ipcRenderer.invoke("settings:load"),
  save: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
});
```

In `src/vite-env.d.ts`, add `settingsAPI` to the `Window` interface.

---

## Audio Recording

### New file: `src/recorder/AudioRecorder.ts`

A class that wraps the browser `MediaRecorder` API:

```ts
export class AudioRecorder {
  private mediaRecorder?: MediaRecorder;
  private chunks: Blob[];
  private stream?: MediaStream;

  get isRecording(): boolean

  async start(): Promise<void>
  // request mic via navigator.mediaDevices.getUserMedia({ audio: true })
  // create MediaRecorder with mimeType "audio/webm;codecs=opus"
  //   (fallback: "audio/webm", then "audio/ogg;codecs=opus")
  // on dataavailable → push to chunks
  // start recording

  stop(): Blob
  // stop MediaRecorder
  // stop all tracks on the stream
  // combine chunks into a single Blob
  // return the blob

  discard(): void
  // stop if running, clear chunks, release stream
}
```

Key details:
- Use `timeslice` arg of `mediaRecorder.start(1000)` to get chunks every 1s (enables progress feedback).
- The class does NOT handle persistence — the caller (Recorder) handles that.
- If `getUserMedia` fails (permission denied), throw. The UI must catch and show a toast/alert.

### Modifications to `src/recorder/Recorder.ts`

Add an `AudioRecorder` instance as a private field.

**`start()` changes:**
- Accept an `enableAudio: boolean` parameter.
- If `enableAudio`, call `this.audioRecorder.start()`. Await it (mic permission is async). If it throws, proceed without audio and set a flag `audioFailed: true` on the active session.

**`stop()` changes:**
- If audio is active, call `this.audioRecorder.stop()` to get the Blob.
- Add `audioBlob?: Blob` to the returned `RecordingSession` (transient — not serialized to JSON).
- Add `hasAudio: boolean` to the `RecordingSession` type.

### Modifications to `src/recorder/types.ts`

Add to `RecordingSession`:

```ts
hasAudio?: boolean;
transcription?: TranscriptionSegment[];
```

Add new type:

```ts
export type TranscriptionSegment = {
  startMs: number;
  endMs: number;
  text: string;
};
```

Add to `RecordingSummary`:

```ts
hasAudio?: boolean;
hasTranscription?: boolean;
```

### Audio persistence via Electron IPC

New IPC channel: `recording:save-audio`

In `electron/main.ts`:

```ts
const audioFile = (canvasId: string, sessionId: string) =>
  path.join(recordingsDir(canvasId), `${sessionId}.webm`);

async function saveAudio(canvasId: string, sessionId: string, buffer: ArrayBuffer) {
  await mkdir(recordingsDir(canvasId), { recursive: true });
  await writeFile(audioFile(canvasId, sessionId), Buffer.from(buffer));
}

async function loadAudio(canvasId: string, sessionId: string): Promise<ArrayBuffer | null> {
  const filePath = audioFile(canvasId, sessionId);
  if (!existsSync(filePath)) return null;
  const buf = await readFile(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function deleteAudio(canvasId: string, sessionId: string) {
  await rm(audioFile(canvasId, sessionId), { force: true });
}
```

Handles:

```
ipcMain.handle("recording:save-audio", (_e, canvasId, sessionId, buffer) => saveAudio(...))
ipcMain.handle("recording:load-audio", (_e, canvasId, sessionId) => loadAudio(...))
```

Wire `deleteRecording` to also delete the `.webm` file if it exists.

Preload additions:

```ts
// inside recordingAPI:
saveAudio: (canvasId: string, sessionId: string, buffer: ArrayBuffer) =>
  ipcRenderer.invoke("recording:save-audio", canvasId, sessionId, buffer),
loadAudio: (canvasId: string, sessionId: string) =>
  ipcRenderer.invoke("recording:load-audio", canvasId, sessionId),
```

Update `Window` types in `vite-env.d.ts`.

### Modifications to `App.tsx`

In `stopRecording()`:
1. Get session and audioBlob from `recorderRef.current.stop()`.
2. If `audioBlob` exists, convert to `ArrayBuffer` and call `window.recordingAPI.saveAudio(session.canvasId, session.sessionId, buffer)`.
3. Kick off transcription as an async background job (see next section). Don't await it — fire and forget, update state when done.

In `handleStartRecording()`:
- Pass `settings.enableAudioRecording` to `recorderRef.current.start()`.

---

## OpenRouter Transcription Client

### New file: `src/openrouter/client.ts`

A generic fetch-based client for OpenRouter:

```ts
const BASE_URL = "https://openrouter.ai/api/v1";

type OpenRouterHeaders = {
  "Authorization": string;
  "Content-Type": "application/json";
  "HTTP-Referer": string;
  "X-Title": string;
};

function makeHeaders(apiKey: string): OpenRouterHeaders

export async function transcribeAudio(
  apiKey: string,
  model: string,
  audioBlob: Blob,
): Promise<TranscriptionSegment[]>
```

Implementation of `transcribeAudio`:

1. Convert Blob to base64: `const buffer = await audioBlob.arrayBuffer(); const base64 = btoa(...)` (use a chunked approach for large blobs to avoid stack overflow — process ArrayBuffer in 8KB chunks).
2. Determine format from blob type: `"webm"` if `audio/webm`, `"ogg"` if `audio/ogg`, etc.
3. POST to `${BASE_URL}/audio/transcriptions`:

```json
{
  "model": "<model>",
  "input_audio": {
    "data": "<base64>",
    "format": "webm"
  },
  "response_format": "verbose_json",
  "timestamp_granularities": ["segment"]
}
```

4. Parse response. Expected `verbose_json` shape:

```json
{
  "text": "full transcription",
  "segments": [
    { "start": 0.0, "end": 4.2, "text": "..." },
    { "start": 4.2, "end": 8.1, "text": "..." }
  ]
}
```

5. Map segments to `TranscriptionSegment[]`:

```ts
segments.map(s => ({
  startMs: Math.round(s.start * 1000),
  endMs: Math.round(s.end * 1000),
  text: s.text.trim(),
}))
```

6. **Fallback**: If the model doesn't return segments (some models only return `{ text }` without timestamps), create a single segment spanning `0` to `session.durationMs` with the full text. This is the "no-timestamp" fallback — we still have useful transcription even without granular timing.

7. **Error handling**: If the API returns a non-200 status, throw with the error body. If the response cannot be parsed, throw a descriptive error. The caller handles these.

### New file: `src/openrouter/chatCompletion.ts`

Generic chat completion wrapper (used by parts B, C, D):

```ts
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function chatCompletion(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string>
```

POST to `${BASE_URL}/chat/completions` with standard OpenAI-compatible body. Return `choices[0].message.content`.

---

## Async Transcription Job

### New file: `src/recorder/TranscriptionJob.ts`

```ts
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
): Promise<TranscriptionSegment[]>
```

Flow:
1. Set status to `{ state: "running", sessionId }`.
2. Call `transcribeAudio(apiKey, model, audioBlob)`.
3. On success, set status to `{ state: "done", sessionId, segments }`.
4. On failure, set status to `{ state: "error", sessionId, error: message }`.
5. Return segments (or rethrow on failure).

### In `App.tsx`:

After `stopRecording()` saves audio, if settings have an API key and audio model:

```ts
const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus>({ state: "idle" });

// in stopRecording:
if (audioBlob && settings.openRouterApiKey) {
  runTranscription(
    settings.openRouterApiKey,
    settings.audioModel,
    audioBlob,
    session.sessionId,
    setTranscriptionStatus,
  ).then(segments => {
    // merge into session
    mergeTranscription(session.canvasId, session.sessionId, segments);
    refreshRecordings(session.canvasId);
  }).catch(() => {
    // status already set to error by runTranscription
  });
}
```

### Merging transcription into events

### New file: `src/recorder/mergeTranscription.ts`

```ts
export function mergeTranscriptionIntoEvents(
  events: InteractionEvent[],
  segments: TranscriptionSegment[],
  sessionStartedAt: string,
): InteractionEvent[]
```

Logic:
1. Create a unified timeline from both events and segments.
2. For each transcription segment, create a new `InteractionEvent` with:
   - `action: "speech"` (add `"speech"` to `RecordedAction` union)
   - `summary`: the segment text
   - `elapsedMs`: segment `startMs`
   - `timestamp`: computed from `sessionStartedAt + startMs`
   - No `elementId` or `elementType` (these are audio-only events)
3. Merge the speech events into the existing events array, sorted by `elapsedMs`.
4. Re-number `seq` across the merged list.

Also add a helper to persist this:

```ts
export async function mergeTranscription(
  canvasId: string,
  sessionId: string,
  segments: TranscriptionSegment[],
): Promise<void>
```

This loads the session JSON from disk, calls `mergeTranscriptionIntoEvents`, sets `session.transcription = segments` and `session.hasAudio = true`, then saves back.

### Updating `RecordingStore.ts`

Add `mergeTranscription` to the store's exports (delegates to IPC for load/save cycle), or handle entirely in the renderer since we already have `loadRecording` and `saveRecording`.

---

## Audio Playback in RecordingDetail

### Modifications to `src/components/RecordingDetail.tsx`

Add an audio player section above the event log:

1. On dialog open, if `session.hasAudio`, load the audio blob via `window.recordingAPI.loadAudio(session.canvasId, session.sessionId)`.
2. Create an object URL from the blob: `URL.createObjectURL(new Blob([buffer], { type: "audio/webm" }))`.
3. Render a custom audio player (not native `<audio controls>`) with:
   - Play/Pause button (lucide `Play` / `Pause` icons)
   - Progress bar (a styled `<input type="range">` or a custom div-based slider)
   - Current time / duration display
   - Use a hidden `<audio>` element for actual playback, controlled via ref.
4. Clean up the object URL on unmount.

Style this section with class `.audio-player` inside `.recording-detail`. Use the existing card/accent colors. The player should be compact (about 48px tall) and sit between the header and the event log.

### Transcription status indicator

If `session.hasAudio && !session.transcription`, show a subtle badge "Transcription pending" or "Transcribing..." next to the audio player.

If transcription failed (exposed via the `transcriptionStatus` state when viewing the last session), show "Transcription failed" with a retry button.

---

## CSS additions to `src/styles.css`

Add styles for:
- `.settings-dialog` — wider dialog (480px), with sections separated by borders
- `.settings-section` — grouped form fields with a heading
- `.settings-field` — label + input pair
- `.settings-toggle` — compact on/off toggle button
- `.audio-player` — compact player bar with play button, progress slider, time display
- `.transcription-badge` — small status indicator
- `.event-log-item--speech` — accent color for speech events (use a purple like `#b197fc`)

---

## Summary of all files touched

| File | Change |
|---|---|
| `src/settings/types.ts` | **NEW** — Settings type + defaults |
| `src/settings/SettingsStore.ts` | **NEW** — IPC wrapper for settings persistence |
| `src/settings/SettingsContext.tsx` | **NEW** — React context for settings |
| `src/components/SettingsDialog.tsx` | **NEW** — Settings UI dialog |
| `src/recorder/AudioRecorder.ts` | **NEW** — MediaRecorder wrapper |
| `src/recorder/TranscriptionJob.ts` | **NEW** — Async transcription runner |
| `src/recorder/mergeTranscription.ts` | **NEW** — Merge transcript segments into events |
| `src/openrouter/client.ts` | **NEW** — OpenRouter transcription API client |
| `src/openrouter/chatCompletion.ts` | **NEW** — OpenRouter chat completion client |
| `src/recorder/types.ts` | **MODIFY** — Add `speech` action, `TranscriptionSegment`, audio fields |
| `src/recorder/Recorder.ts` | **MODIFY** — Integrate AudioRecorder, return audio blob |
| `src/recorder/RecordingStore.ts` | **MODIFY** — Add audio IPC wrappers |
| `src/components/RecordingDetail.tsx` | **MODIFY** — Add audio player + transcription status |
| `src/components/Toolbar.tsx` | **MODIFY** — Add settings gear button |
| `src/App.tsx` | **MODIFY** — Wire settings context, audio recording, async transcription |
| `src/styles.css` | **MODIFY** — Add settings, audio player, speech event styles |
| `src/vite-env.d.ts` | **MODIFY** — Add `settingsAPI` and audio methods to Window |
| `electron/main.ts` | **MODIFY** — Add settings + audio IPC handlers |
| `electron/preload.ts` | **MODIFY** — Expose settings + audio APIs |

---

## Implementation order

1. Settings infrastructure (types → store → IPC → context → dialog)
2. AudioRecorder class
3. Integrate AudioRecorder into Recorder.start/stop
4. Audio persistence IPC (save/load/delete .webm)
5. Wire audio recording in App.tsx
6. OpenRouter client (transcribeAudio + chatCompletion)
7. TranscriptionJob + mergeTranscription
8. Wire async transcription in App.tsx
9. Audio player in RecordingDetail
10. CSS for all new components
11. Test end-to-end: record with mic → stop → see transcription appear → play audio
