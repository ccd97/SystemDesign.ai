# Part B — Judge / Design Evaluation

A "Judge" button that sends the full recording (canvas events + transcription) to a smart LLM to evaluate the candidate's HLD interview performance.

---

## Overview

After a recording is complete, a "Judge" button appears in the toolbar and in the RecordingDetail dialog. Clicking it assembles the full event log (including speech events from transcription) and the final scene snapshot, then sends everything to the configured `smartModel` via OpenRouter chat completion. The LLM acts as an experienced system design interviewer and returns structured feedback. The result is displayed in a dedicated JudgeReport dialog and persisted alongside the recording.

---

## Prerequisites

- Part A must be complete (settings, OpenRouter client, `chatCompletion`, recording types with `speech` events).

---

## Judge Prompt Construction

### New file: `src/judge/buildJudgePrompt.ts`

```ts
export function buildJudgePrompt(session: RecordingSession): ChatMessage[]
```

Constructs the message array:

**System message:**

```
You are a senior system design interviewer evaluating a candidate's high-level design (HLD) interview performance.

You are given a recording of the candidate's drawing and verbal explanations on an Excalidraw canvas.

The recording contains two types of events:
- Drawing events: element creation, movement, resizing, text editing, etc.
- Speech events: what the candidate said (transcribed from audio).

Evaluate the candidate on these dimensions:
1. Problem Understanding — Did they clarify requirements and constraints?
2. High-Level Architecture — Is the overall design sound? Are major components identified?
3. Component Design — Are individual components well thought out?
4. Data Model — Is the data model appropriate for the problem?
5. Scalability — Did they address scaling, caching, load balancing, etc.?
6. Communication — Did they explain their thinking clearly? Did they structure their approach?
7. Diagram Quality — Is the Excalidraw diagram organized, readable, and complete?

For each dimension, give:
- A score from 1 to 5
- Specific observations (what was good, what was missing)

Then give:
- Overall score (1-5)
- Top 3 strengths
- Top 3 areas for improvement
- A brief overall summary (2-3 sentences)

Be specific. Reference actual events and speech from the recording. Be constructive, not harsh.

Respond in valid JSON matching this schema:
{
  "dimensions": [
    { "name": string, "score": number, "observations": string }
  ],
  "overallScore": number,
  "strengths": [string, string, string],
  "improvements": [string, string, string],
  "summary": string
}
```

**User message:**

Build from the session data:
- Session metadata: canvas name, duration, event count.
- The full event list formatted as a readable timeline (seq, elapsed time, action, summary).
- For speech events: include the text verbatim.
- The final scene snapshot (compact JSON of the elements — types, text content, positions).

Keep the total token count manageable:
- If the event list is very long (>200 events), summarize the middle section and keep the first 50 and last 50 in full.
- Strip snapshot fields from non-speech events (they're redundant with the final scene).

---

## Judge Report Type

### Additions to `src/judge/types.ts` (new file)

```ts
export type JudgeDimension = {
  name: string;
  score: number;
  observations: string;
};

export type JudgeReport = {
  sessionId: string;
  model: string;
  judgedAt: string;
  dimensions: JudgeDimension[];
  overallScore: number;
  strengths: string[];
  improvements: string[];
  summary: string;
};
```

---

## Running the Judge

### New file: `src/judge/runJudge.ts`

```ts
export type JudgeStatus =
  | { state: "idle" }
  | { state: "running"; sessionId: string }
  | { state: "done"; sessionId: string; report: JudgeReport }
  | { state: "error"; sessionId: string; error: string };

export async function runJudge(
  apiKey: string,
  model: string,
  session: RecordingSession,
  onStatusChange: (status: JudgeStatus) => void,
): Promise<JudgeReport>
```

Flow:
1. Set status to `running`.
2. Call `chatCompletion(apiKey, model, buildJudgePrompt(session), { temperature: 0.3 })`.
3. Parse the response as JSON. Validate the shape loosely (check for `dimensions` array, `overallScore`).
4. Build a `JudgeReport` object.
5. Set status to `done`.
6. Return the report.

Error handling: If the LLM returns invalid JSON, try to extract the JSON from the response (it might be wrapped in markdown code fences). If still invalid, set status to `error`.

---

## Persistence

### IPC additions

New file paths:

```ts
const judgeFile = (canvasId: string, sessionId: string) =>
  path.join(recordingsDir(canvasId), `${sessionId}.judge.json`);
```

New handles:

```
recording:save-judge  → writeFile(judgeFile, JSON.stringify(report))
recording:load-judge  → readFile(judgeFile) or null
recording:delete-judge → rm(judgeFile)
```

Wire `deleteRecording` to also clean up `.judge.json`.

Preload additions to `recordingAPI`:

```ts
saveJudge: (canvasId, sessionId, report) => ipcRenderer.invoke("recording:save-judge", ...),
loadJudge: (canvasId, sessionId) => ipcRenderer.invoke("recording:load-judge", ...),
```

Update `Window` types.

---

## UI: Judge Button

### In `src/components/Toolbar.tsx`

Add a "Judge" button after the download button, only visible when:
- `!isRecording`
- `hasRecording` is true (a completed session exists)
- `settings.enableJudge` is true

Props addition:
```ts
onJudge: () => void;
judgeStatus: JudgeStatus;
enableJudge: boolean;
```

Button appearance:
- Icon: lucide `Scale` (or `Award`)
- Label: "Judge" (text visible, not icon-only)
- When judging is running: show a spinner animation (CSS rotation on a lucide `Loader2` icon)
- When done: change icon to `CheckCircle2` briefly, then back to `Scale`

### In `src/components/RecordingDetail.tsx`

Add a "Judge" button in the footer row (next to Copy/Download/Delete). Same visibility conditions.

If a judge report exists for this session (loaded via `loadJudge` on dialog open), show a "View Report" button instead that opens the JudgeReport dialog.

---

## UI: JudgeReport Dialog

### New file: `src/components/JudgeReport.tsx`

A dialog that displays the judge evaluation. Wider than the recording detail dialog: `min-width: 640px, max-width: 800px`.

Layout:

```
┌─────────────────────────────────────────────┐
│  ← Judge Report            [Overall: 4/5]   │
│  Canvas Name · Duration · Model used         │
├─────────────────────────────────────────────┤
│                                             │
│  Summary                                    │
│  "The candidate demonstrated strong..."     │
│                                             │
│  ─────────────────────────────────────────  │
│                                             │
│  Dimensions                                 │
│  ┌──────────────────────────────────────┐   │
│  │ Problem Understanding    ████░ 4/5   │   │
│  │ observations text...                  │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ High-Level Architecture  ███░░ 3/5   │   │
│  │ observations text...                  │   │
│  └──────────────────────────────────────┘   │
│  ... (7 dimensions total)                   │
│                                             │
│  ─────────────────────────────────────────  │
│                                             │
│  ✓ Strengths              ▲ Improvements    │
│  • point 1                • point 1         │
│  • point 2                • point 2         │
│  • point 3                • point 3         │
│                                             │
├─────────────────────────────────────────────┤
│                              [Close]        │
└─────────────────────────────────────────────┘
```

Each dimension card:
- Name on the left, score bar on the right.
- Score bar: 5 small blocks. Filled blocks use a gradient from red (1) → yellow (3) → green (5). Unfilled blocks are `hsl(var(--accent))`.
- Observations text below in muted color.

Strengths section: green-tinted left-border cards (similar to `--event-accent` pattern).
Improvements section: amber-tinted left-border cards.

---

## CSS additions

```css
.judge-report { /* wider dialog overrides */ }
.judge-summary { /* summary text block */ }
.judge-dimension { /* individual dimension card */ }
.judge-score-bar { /* 5-block visual score indicator */ }
.judge-score-block { /* individual block in the bar */ }
.judge-score-block--filled { /* filled state with gradient color */ }
.judge-strengths, .judge-improvements { /* two-column grid */ }
.judge-point { /* individual point with left border accent */ }
.judge-button-running { /* spinner animation */ }

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

## Wiring in `App.tsx`

State additions:

```ts
const [judgeStatus, setJudgeStatus] = useState<JudgeStatus>({ state: "idle" });
const [judgeReport, setJudgeReport] = useState<JudgeReport>();
```

New handler:

```ts
async function handleJudge() {
  if (!lastSession || !settings.openRouterApiKey) return;
  const report = await runJudge(
    settings.openRouterApiKey,
    settings.smartModel,
    lastSession,
    setJudgeStatus,
  );
  await window.recordingAPI.saveJudge(lastSession.canvasId, lastSession.sessionId, report);
  setJudgeReport(report);
}
```

Pass `onJudge`, `judgeStatus`, `enableJudge` to Toolbar.

When opening a recording in RecordingDetail, also attempt to load the judge report.

---

## Summary of all files touched

| File | Change |
|---|---|
| `src/judge/types.ts` | **NEW** — JudgeReport, JudgeDimension types |
| `src/judge/buildJudgePrompt.ts` | **NEW** — Prompt construction from session data |
| `src/judge/runJudge.ts` | **NEW** — Async judge execution |
| `src/components/JudgeReport.tsx` | **NEW** — Judge report display dialog |
| `src/components/Toolbar.tsx` | **MODIFY** — Add Judge button |
| `src/components/RecordingDetail.tsx` | **MODIFY** — Add Judge/View Report button |
| `src/App.tsx` | **MODIFY** — Wire judge logic, state, handlers |
| `src/styles.css` | **MODIFY** — Judge report styles, score bars, spinner |
| `src/vite-env.d.ts` | **MODIFY** — Add judge IPC types to Window |
| `electron/main.ts` | **MODIFY** — Add judge file IPC handlers |
| `electron/preload.ts` | **MODIFY** — Expose judge API |

---

## Implementation order

1. Judge types
2. `buildJudgePrompt` — construct the prompt from session data
3. `runJudge` — call OpenRouter and parse response
4. Judge persistence IPC (save/load/delete .judge.json)
5. Judge button in Toolbar + RecordingDetail
6. JudgeReport dialog component
7. CSS for judge report, score bars, animations
8. Wire everything in App.tsx
9. Test: complete a recording → click Judge → see report appear
