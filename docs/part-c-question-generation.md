# Part C — HLD Question Generation

Generate HLD interview questions via LLM and auto-insert them onto the Excalidraw canvas.

---

## Overview

A "Generate Question" button in the toolbar calls the configured `fastModel` to produce a concise, vague HLD interview question (e.g. "Design a system like WhatsApp that supports sending/receiving messages and creating group chats"). The generated question is automatically added as a text element on the Excalidraw canvas, ready for the candidate to start designing.

---

## Prerequisites

- Part A must be complete (settings infrastructure, OpenRouter `chatCompletion` client, feature toggles).
- The Excalidraw API ref (`excalidrawApiRef`) must be accessible to add elements programmatically.

---

## Question Generation Prompt

### New file: `src/questions/generateQuestion.ts`

```ts
import { chatCompletion, type ChatMessage } from "../openrouter/chatCompletion";

export async function generateQuestion(
  apiKey: string,
  model: string,
): Promise<string>
```

Constructs the prompt:

**System message:**

```
You are a senior system design interviewer. Generate a single high-level design (HLD) interview question.

Rules:
- The question must be realistic and commonly asked in HLD interviews at top tech companies.
- Keep it vague and open-ended, just like a real interview. Do not over-specify requirements.
- Phrase it as "Design a [system] like [example]" — one sentence, direct and concrete.
- Do NOT use "Explain how you would..." or similar instructional phrasing. The question should stand on its own as a design prompt.
- Do NOT include follow-up questions, hints, expected answers, or implementation details.
- Do NOT include numbering or bullet points.
- Do NOT conflate fundamentally different platforms (e.g. Instagram and Twitter have very different feed models — pick one).
- Vary the domain: messaging, social media, storage, streaming, payments, ride-sharing, search, e-commerce, etc.

Examples of good questions:
- "Design a messaging system like WhatsApp that supports one-on-one and group chats."
- "Design a URL shortening service similar to bit.ly."
- "Design a video streaming platform like YouTube."
- "Design a ride-sharing service like Uber."

Examples of bad questions:
- "Design a news feed system for a social media platform like Instagram or Twitter..." (conflates two very different systems)
- "Explain how you would design a notification system..." (instructional phrasing, not a design prompt)

Respond with ONLY the question text. No preamble, no explanation.
```

**User message:**

```
Generate a new HLD interview question.
```

Options: `{ temperature: 0.9 }` — high temperature for variety.

Return `choices[0].message.content.trim()`.

---

## Adding Text to Excalidraw Canvas

### New file: `src/canvas/addTextElement.ts`

This module creates an Excalidraw text element and adds it to the scene.

```ts
export type AddTextOptions = {
  text: string;
  x?: number;
  y?: number;
  fontSize?: number;
  fontFamily?: number;
};

export function createTextElement(options: AddTextOptions): Record<string, unknown>
```

Constructs a valid Excalidraw element object:

```ts
{
  id: crypto.randomUUID(),
  type: "text",
  x: options.x ?? 100,
  y: options.y ?? 100,
  width: 0,          // Excalidraw auto-measures
  height: 0,         // Excalidraw auto-measures
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  text: options.text,
  fontSize: options.fontSize ?? 28,
  fontFamily: options.fontFamily ?? 1, // 1 = Virgil (hand-drawn)
  textAlign: "left",
  verticalAlign: "top",
  containerId: null,
  originalText: options.text,
  autoResize: true,
  lineHeight: 1.25,
  isDeleted: false,
  version: 1,
  versionNonce: Math.floor(Math.random() * 2147483647),
  seed: Math.floor(Math.random() * 2147483647),
  groupIds: [],
  frameId: null,
  roundness: null,
  boundElements: null,
  updated: Date.now(),
  link: null,
  locked: false,
}
```

> **Important**: The Excalidraw API's `updateScene` method is needed to inject this element. The existing `excalidrawApiRef` already exposes `updateScene`. We need to extend the ref type to include `getSceneElements()` as well so we can append without losing existing elements.

### Modifications to type `ExcalidrawThemeApi` in `App.tsx`

Rename and expand the type:

```ts
type ExcalidrawApi = {
  updateScene: (sceneData: {
    appState?: { theme: CanvasTheme };
    elements?: readonly unknown[];
  }) => void;
  getSceneElements: () => readonly unknown[];
};
```

This is already supported by the `@excalidraw/excalidraw` component's API — we just need to type it.

---

## Question Generation Status

### New file: `src/questions/types.ts`

```ts
export type QuestionGenStatus =
  | { state: "idle" }
  | { state: "generating" }
  | { state: "done"; question: string }
  | { state: "error"; error: string };
```

---

## UI: Generate Question Button

### Modifications to `src/components/Toolbar.tsx`

Add a "Generate Question" button in the toolbar (next to the Judge button). Visibility conditions:
- `settings.enableQuestionGen` is true
- Not recording (generation should happen before the interview starts)

Props addition:

```ts
onGenerateQuestion: () => void;
questionGenStatus: QuestionGenStatus;
enableQuestionGen: boolean;
```

Button appearance:
- Icon: lucide `Sparkles`
- Text: "New Question"
- When generating: show `Loader2` with spin animation, disable the button.
- When done: brief `CheckCircle2`, then back to `Sparkles`.

Position: Place it to the LEFT of the recording controls, as a separate group. This is a "preparation" action, not a recording action.

The button group layout in the toolbar becomes:

```
[Theme] [New Question] [● 00:00 | 0 events | Record/Stop | Copy | Download | Judge]
```

---

## Wiring in `App.tsx`

State:

```ts
const [questionGenStatus, setQuestionGenStatus] = useState<QuestionGenStatus>({ state: "idle" });
```

Handler:

```ts
async function handleGenerateQuestion() {
  if (!settings.openRouterApiKey || !activeCanvasId) return;

  setQuestionGenStatus({ state: "generating" });
  try {
    const question = await generateQuestion(
      settings.openRouterApiKey,
      settings.fastModel,
    );

    // Add to canvas
    const textElement = createTextElement({ text: question, x: 100, y: 60, fontSize: 28 });
    const currentElements = excalidrawApiRef.current?.getSceneElements() ?? [];
    excalidrawApiRef.current?.updateScene({
      elements: [...currentElements, textElement],
    });

    setQuestionGenStatus({ state: "done", question });

    // Reset status after 2 seconds
    setTimeout(() => setQuestionGenStatus({ state: "idle" }), 2000);
  } catch (e) {
    setQuestionGenStatus({
      state: "error",
      error: e instanceof Error ? e.message : "Failed to generate question",
    });
  }
}
```

Pass to Toolbar:

```tsx
<Toolbar
  // ...existing props
  onGenerateQuestion={handleGenerateQuestion}
  questionGenStatus={questionGenStatus}
  enableQuestionGen={settings.enableQuestionGen}
/>
```

---

## Recording the generated question as an event

When a question is generated and added to the canvas, the Excalidraw `onChange` handler will fire automatically (because `updateScene` triggers it). The existing `Recorder.recordChange()` will detect the new text element and record it as an `element_created` + `text_edited` event naturally. No special handling needed.

However, we should also record it explicitly as a special event type so the Judge (Part B) knows this was the interview question:

### New action type

Add `"question_generated"` to the `RecordedAction` union in `types.ts`.

In `Recorder.ts`, add a method:

```ts
recordCustomEvent(action: RecordedAction, summary: string): void {
  if (!this.activeSession) return;
  const now = Date.now();
  this.activeSession.events.push({
    seq: this.activeSession.events.length + 1,
    action,
    summary,
    timestamp: new Date(now).toISOString(),
    elapsedMs: now - this.activeSession.startedAtMs,
  });
}
```

In `App.tsx`, after successfully generating a question:

```ts
if (recorderRef.current.isRecording) {
  recorderRef.current.recordCustomEvent(
    "question_generated",
    `Interview question: ${question}`,
  );
}
```

Add CSS accent for the new event type:

```css
.event-log-item--question_generated {
  --event-accent: #da77f2; /* purple */
}
```

---

## Summary of all files touched

| File | Change |
|---|---|
| `src/questions/generateQuestion.ts` | **NEW** — LLM question generation |
| `src/questions/types.ts` | **NEW** — QuestionGenStatus type |
| `src/canvas/addTextElement.ts` | **NEW** — Create and inject text elements |
| `src/components/Toolbar.tsx` | **MODIFY** — Add Generate Question button |
| `src/App.tsx` | **MODIFY** — Wire question gen handler, canvas injection |
| `src/recorder/types.ts` | **MODIFY** — Add `question_generated` action |
| `src/recorder/Recorder.ts` | **MODIFY** — Add `recordCustomEvent` method |
| `src/styles.css` | **MODIFY** — Question generated event accent color |

---

## Implementation order

1. `generateQuestion` — prompt + API call
2. `addTextElement` — Excalidraw element creation
3. Expand `ExcalidrawApi` type in App.tsx
4. Add `question_generated` to RecordedAction, add `recordCustomEvent` to Recorder
5. Generate Question button in Toolbar
6. Wire handler in App.tsx (generate → inject → record event)
7. CSS for new event type accent
8. Test: click "New Question" → see question appear on canvas → record → see it in event log
