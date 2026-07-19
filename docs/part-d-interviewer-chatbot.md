# Part D — Interviewer Chatbot

A chatbot that answers candidate clarification questions like a human interviewer — via text or voice input.

---

## Overview

During a recording session, the candidate can ask clarifying questions to an AI interviewer (e.g. "How many active users?" → "Assume around 100 million monthly active users"). The chatbot uses the `fastModel` and is strictly limited to answering clarification questions — it never gives hints, solutions, or architectural suggestions. Interaction is possible via text input or voice (using the audio recording + transcription pipeline from Part A). All chatbot exchanges are recorded as events in the session timeline.

---

## Prerequisites

- Part A complete (AudioRecorder, OpenRouter transcription client, settings).
- Part C complete (Excalidraw API ref expansion, `recordCustomEvent` on Recorder).

---

## Chatbot System Prompt

### New file: `src/chatbot/buildChatbotPrompt.ts`

```ts
export function buildChatbotSystemPrompt(interviewQuestion: string): string
```

Returns:

```
You are a system design interviewer conducting a high-level design interview.

The interview question is: "{interviewQuestion}"

Your role:
- Answer ONLY clarifying questions from the candidate.
- Provide realistic numbers, constraints, and requirements when asked.
- Sound like a human interviewer — be conversational, brief, and natural.
- Do NOT give hints about the solution or architecture.
- Do NOT suggest approaches, patterns, or technologies.
- Do NOT evaluate or comment on the candidate's design.
- If the candidate asks something that would reveal the answer, respond with something like "That's for you to decide" or "What do you think would work here?"

Examples of good responses:
- Q: "How many users?" → "Let's say around 100 million monthly active users."
- Q: "Do we need to support real-time?" → "Yes, messages should be delivered in near real-time, say under a second."
- Q: "Should I use SQL or NoSQL?" → "That's a design decision for you to make. What are the trade-offs you're considering?"
- Q: "What about read/write ratio?" → "Assume it's read-heavy, roughly 10:1."

Keep responses to 1-3 sentences. Be direct.
```

```ts
export function buildChatbotMessages(
  systemPrompt: string,
  conversationHistory: ChatbotMessage[],
  newQuestion: string,
): ChatMessage[]
```

This constructs the full messages array for the API call:
1. System message with the prompt above.
2. All previous conversation turns (alternating user/assistant).
3. The new user question.

---

## Chatbot Types

### New file: `src/chatbot/types.ts`

```ts
export type ChatbotMessage = {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  elapsedMs: number;
  source: "text" | "voice";
};

export type ChatbotState = {
  isOpen: boolean;
  interviewQuestion: string;
  messages: ChatbotMessage[];
  isThinking: boolean;
  isListening: boolean;
  error?: string;
};
```

---

## Running the Chatbot

### New file: `src/chatbot/runChatbot.ts`

```ts
export async function askChatbot(
  apiKey: string,
  model: string,
  interviewQuestion: string,
  history: ChatbotMessage[],
  question: string,
): Promise<string>
```

1. Build messages via `buildChatbotMessages`.
2. Call `chatCompletion(apiKey, model, messages, { temperature: 0.6, maxTokens: 200 })`.
3. Return the response text.

---

## Voice Input Pipeline

For voice-based questions, reuse the `AudioRecorder` from Part A but in a different mode — short single-utterance recording:

### New file: `src/chatbot/VoiceInput.ts`

```ts
export class VoiceInput {
  private audioRecorder: AudioRecorder;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, audioModel: string)

  async startListening(): Promise<void>
  // start recording via AudioRecorder

  async stopAndTranscribe(): Promise<string>
  // stop recording, get blob
  // transcribe via transcribeAudio (from openrouter/client.ts)
  // return the full text (ignore timestamps — we just need the question text)

  cancelListening(): void
  // discard recording
}
```

This creates a short audio clip (the candidate's question), transcribes it, and returns the text. The text is then fed to `askChatbot` exactly like a typed question.

---

## UI: Chatbot Panel

### New file: `src/components/ChatbotPanel.tsx`

A floating panel anchored to the bottom-right of the canvas area. Not a dialog/modal — it's a panel that stays visible while the user draws.

```
┌─────────────────────────────┐
│  🎙 Interviewer Chat    [−] │  ← header with minimize
├─────────────────────────────┤
│                             │
│  ┌───────────────────────┐  │
│  │ You (voice):          │  │
│  │ How many active users?│  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ Interviewer:          │  │
│  │ Around 100M MAU.      │  │
│  └───────────────────────┘  │
│                             │
│  ... (scrollable)           │
│                             │
├─────────────────────────────┤
│  [🎤]  [Type a question...] │  ← input row
│         [Send ↵]            │
└─────────────────────────────┘
```

#### Panel States

- **Closed**: Only a small floating button visible (lucide `MessageCircle` icon with a badge showing message count).
- **Minimized**: Just the header bar visible.
- **Open**: Full panel with messages + input.

#### Components

**Header:**
- Title: "Interviewer Chat"
- Minimize button (lucide `Minus`)
- Close button (lucide `X`)

**Message list:**
- Scrollable area (use Radix ScrollArea).
- User messages: right-aligned, subtle accent background.
- Assistant messages: left-aligned, card background.
- Each message shows a small "voice" or "text" indicator if source is voice.
- If `isThinking` is true, show a typing indicator (three dots animation) as the last item.

**Input row:**
- Microphone button on the left (lucide `Mic`).
  - Click to start listening → button changes to `MicOff` with a pulsing red border.
  - Click again to stop → transcribes → sends.
  - While listening, show a subtle waveform or pulsing animation.
- Text input field (standard `.ui-input`).
- Send button (lucide `SendHorizontal`), enabled only when input is non-empty.
- Enter key also sends.

**Error state:**
- If an error occurs (API failure), show an inline error message with a retry option.

#### Panel dimensions:
- Width: 360px
- Max height: 480px (or 60% of canvas height, whichever is smaller)
- Position: fixed, bottom-right of the canvas-host area (not the viewport — relative to the workspace).

#### Animation:
- Panel slides up from the bottom-right when opening.
- Panel slides down when closing/minimizing.
- Messages fade in.

---

## Recording Chatbot Events

Every chatbot exchange is recorded in the session event list. Two new action types:

Add to `RecordedAction` union in `types.ts`:

```ts
| "candidate_question"
| "interviewer_response"
```

When a message is sent/received, if recording is active:

```ts
recorderRef.current.recordCustomEvent(
  "candidate_question",
  `[${source}] ${question}`,
);

// after receiving response:
recorderRef.current.recordCustomEvent(
  "interviewer_response",
  response,
);
```

### Event accent colors

```css
.event-log-item--candidate_question {
  --event-accent: #74c0fc; /* light blue */
}

.event-log-item--interviewer_response {
  --event-accent: #a9e34b; /* lime green */
}
```

---

## Detecting the Interview Question

The chatbot needs to know what question was asked to provide contextual answers. The interview question comes from two possible sources:

1. **Generated via Part C**: When `questionGenStatus.state === "done"`, use `questionGenStatus.question`.
2. **Manual**: The user typed their own question on the canvas. In this case, we need a way to set it.

### Solution: Store the active interview question in state

```ts
const [interviewQuestion, setInterviewQuestion] = useState<string>("");
```

When a question is generated (Part C), automatically set it:
```ts
setInterviewQuestion(question);
```

Also, allow manual override: In the chatbot panel header, show the current question with an "Edit" button that opens a small inline text input to change it. If no question is set, the chatbot prompts the user to either generate one or type one before starting.

---

## Wiring in `App.tsx`

State:

```ts
const [chatbotState, setChatbotState] = useState<ChatbotState>({
  isOpen: false,
  interviewQuestion: "",
  messages: [],
  isThinking: false,
  isListening: false,
});
```

Handlers:

```ts
async function handleChatbotSend(question: string, source: "text" | "voice") {
  const userMsg: ChatbotMessage = {
    role: "user",
    text: question,
    timestamp: new Date().toISOString(),
    elapsedMs: recorderRef.current.startedAtMs
      ? Date.now() - recorderRef.current.startedAtMs
      : 0,
    source,
  };

  setChatbotState(prev => ({
    ...prev,
    messages: [...prev.messages, userMsg],
    isThinking: true,
    error: undefined,
  }));

  if (recorderRef.current.isRecording) {
    recorderRef.current.recordCustomEvent("candidate_question", `[${source}] ${question}`);
  }

  try {
    const response = await askChatbot(
      settings.openRouterApiKey,
      settings.fastModel,
      chatbotState.interviewQuestion,
      [...chatbotState.messages, userMsg],
      question,
    );

    const assistantMsg: ChatbotMessage = {
      role: "assistant",
      text: response,
      timestamp: new Date().toISOString(),
      elapsedMs: recorderRef.current.startedAtMs
        ? Date.now() - recorderRef.current.startedAtMs
        : 0,
      source: "text",
    };

    setChatbotState(prev => ({
      ...prev,
      messages: [...prev.messages, assistantMsg],
      isThinking: false,
    }));

    if (recorderRef.current.isRecording) {
      recorderRef.current.recordCustomEvent("interviewer_response", response);
    }
  } catch (e) {
    setChatbotState(prev => ({
      ...prev,
      isThinking: false,
      error: e instanceof Error ? e.message : "Failed to get response",
    }));
  }
}
```

Voice input handler:

```ts
const voiceInputRef = useRef<VoiceInput>();

function handleStartListening() {
  if (!voiceInputRef.current) {
    voiceInputRef.current = new VoiceInput(settings.openRouterApiKey, settings.audioModel);
  }
  voiceInputRef.current.startListening();
  setChatbotState(prev => ({ ...prev, isListening: true }));
}

async function handleStopListening() {
  if (!voiceInputRef.current) return;
  const text = await voiceInputRef.current.stopAndTranscribe();
  setChatbotState(prev => ({ ...prev, isListening: false }));
  if (text.trim()) {
    await handleChatbotSend(text.trim(), "voice");
  }
}
```

### Rendering

The `ChatbotPanel` is rendered inside the `.canvas-host` section (so it's positioned relative to the canvas):

```tsx
<section className="canvas-host">
  {/* ...existing Excalidraw rendering... */}

  {settings.enableChatbot && (
    <ChatbotPanel
      state={chatbotState}
      onSend={(text) => void handleChatbotSend(text, "text")}
      onStartListening={handleStartListening}
      onStopListening={() => void handleStopListening()}
      onToggle={() => setChatbotState(prev => ({ ...prev, isOpen: !prev.isOpen }))}
      onClose={() => setChatbotState(prev => ({ ...prev, isOpen: false }))}
      onSetQuestion={(q) => setChatbotState(prev => ({ ...prev, interviewQuestion: q }))}
    />
  )}
</section>
```

When a question is generated (Part C), sync it:

```ts
// in handleGenerateQuestion, after success:
setChatbotState(prev => ({ ...prev, interviewQuestion: question }));
```

---

## Storing Chatbot History in Recording

When `Recorder.stop()` is called, the chatbot messages should be included in the session. Add to `RecordingSession`:

```ts
chatHistory?: ChatbotMessage[];
```

In `App.tsx`, before calling `recorderRef.current.stop()`:

```ts
// The events are already recorded via recordCustomEvent.
// Also attach the full chat history for the Judge to reference.
```

After stop, when saving the session, merge `chatbotState.messages` into the session object:

```ts
if (session && chatbotState.messages.length > 0) {
  session.chatHistory = chatbotState.messages;
  await saveRecording(session.canvasId, session);
}
```

The Judge (Part B) can then reference `chatHistory` in its evaluation for richer context.

---

## CSS additions

```css
/* Chatbot floating panel */
.chatbot-fab { /* floating action button when panel is closed */ }
.chatbot-panel { /* the panel container */ }
.chatbot-header { /* header with title + controls */ }
.chatbot-messages { /* scrollable message area */ }
.chatbot-message { /* individual message bubble */ }
.chatbot-message--user { /* right-aligned, accent bg */ }
.chatbot-message--assistant { /* left-aligned, card bg */ }
.chatbot-message-source { /* small "voice"/"text" indicator */ }
.chatbot-typing { /* typing indicator dots */ }
.chatbot-input-row { /* bottom input area */ }
.chatbot-mic-button { /* microphone button */ }
.chatbot-mic-button--listening { /* pulsing state */ }
.chatbot-send-button { /* send button */ }
.chatbot-question-bar { /* shows current interview question */ }
.chatbot-error { /* inline error message */ }

/* Animations */
@keyframes chatbot-slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes chatbot-message-in {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes chatbot-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgb(250 82 82 / 0.4); }
  50% { box-shadow: 0 0 0 6px rgb(250 82 82 / 0); }
}

@keyframes chatbot-dots {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}
```

Panel styling details:
- Position: `absolute`, bottom `16px`, right `16px` (within `.canvas-host`).
- Width: `360px`, max-height: `min(480px, 60vh)`.
- Background: `hsl(var(--card))` with `backdrop-filter: blur(14px)`.
- Border: `1px solid hsl(var(--border))`.
- Border-radius: `0.75rem`.
- Box-shadow: `0 8px 30px rgb(0 0 0 / 0.3)`.
- The FAB button: `48px` circle, positioned at bottom-right.

Message bubbles:
- User: `background: hsl(var(--accent))`, aligned right.
- Assistant: `background: hsl(var(--card))`, aligned left, with a slightly different border.
- Max-width: `85%` of the panel width.
- Font-size: `13px`, line-height: `1.5`.

---

## Summary of all files touched

| File | Change |
|---|---|
| `src/chatbot/types.ts` | **NEW** — ChatbotMessage, ChatbotState types |
| `src/chatbot/buildChatbotPrompt.ts` | **NEW** — System prompt + message builder |
| `src/chatbot/runChatbot.ts` | **NEW** — Chat completion wrapper |
| `src/chatbot/VoiceInput.ts` | **NEW** — Voice recording + transcription for short utterances |
| `src/components/ChatbotPanel.tsx` | **NEW** — Floating chat panel UI |
| `src/recorder/types.ts` | **MODIFY** — Add `candidate_question`, `interviewer_response` actions, `chatHistory` field |
| `src/recorder/Recorder.ts` | **MODIFY** — Already has `recordCustomEvent` from Part C (no change needed here) |
| `src/App.tsx` | **MODIFY** — Wire chatbot state, handlers, voice input, render panel |
| `src/styles.css` | **MODIFY** — Add chatbot panel, message bubbles, animations |

---

## Implementation order

1. Chatbot types
2. `buildChatbotPrompt` — system prompt construction
3. `runChatbot` — chat completion wrapper
4. `VoiceInput` class — short utterance recording + transcription
5. `ChatbotPanel` component — full UI with messages, text input, mic button
6. Wire chatbot in App.tsx — state, handlers, panel rendering
7. Connect to recording events (`recordCustomEvent`)
8. CSS for panel, messages, animations, FAB
9. Connect interview question from Part C
10. Add `chatHistory` to session persistence
11. Test: open chatbot → type question → get answer → try voice → check events in recording
