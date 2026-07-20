# CLAUDE.md

Instructions for Claude when working on the SystemDesign.ai codebase.

## Project Overview

SystemDesign.ai is an Electron desktop app for practicing system design interviews. Users draw architecture diagrams on an Excalidraw canvas, record their sessions (drawing + audio), interact with an AI interviewer chatbot, and receive AI-powered evaluations.

## Tech Stack

- **Electron** (v31) — desktop shell with context-isolated preload bridge
- **React 18** + **TypeScript** — renderer process UI
- **Vite** + `vite-plugin-electron` — build tooling, dev server on 127.0.0.1
- **Excalidraw** (v0.18) — embedded canvas component
- **Radix UI** — dialog, scroll-area, collapsible primitives
- **Lucide React** — icons
- **Vanilla CSS** — single `src/styles.css` file, no Tailwind

## Architecture

### Two-Process Model

- **Main process** (`electron/main.ts`) — handles all file I/O via IPC handlers. Stores data in `app.getPath("userData")/canvases/`. No database — just JSON files and a canvas index.
- **Renderer process** (`src/`) — React app. Communicates with main via `window.canvasAPI`, `window.recordingAPI`, `window.settingsAPI`, `window.recorderAPI` (exposed in `electron/preload.ts`).

### Key Modules

| Directory | Purpose | External API |
|---|---|---|
| `src/canvas/` | Canvas CRUD, serialization, theme normalization | Main process IPC |
| `src/recorder/` | Recording engine, diff-based event capture, audio recorder, transcription merge | Browser MediaRecorder API |
| `src/chatbot/` | Interviewer chatbot prompts and logic | OpenRouter |
| `src/judge/` | Judge evaluation prompts, report parsing | OpenRouter |
| `src/questions/` | Interview question generation with domain selection | OpenRouter |
| `src/openrouter/` | Chat completion client with retries and timeouts | openrouter.ai/api/v1 |
| `src/gemini/` | Audio transcription via Gemini generateContent | generativelanguage.googleapis.com |
| `src/settings/` | Settings types, defaults, validation, React context | Main process IPC |
| `src/components/` | All React UI components | — |

### Data Flow

1. Canvas data is auto-saved as `.excalidraw` JSON files via IPC
2. Recordings are saved as `{sessionId}.json` in each canvas's `recordings/` dir
3. Audio is saved as `{sessionId}.webm` alongside recording JSON
4. Judge reports are saved as `{sessionId}.judge.json`
5. Settings are stored in `userData/settings.json`

### Recording Engine

The `Recorder` class (`src/recorder/Recorder.ts`) captures canvas changes by diffing scene snapshots. It:
- Produces semantic events (element_created, element_moved, text_edited, etc.)
- Coalesces rapid changes into single events
- Stores periodic snapshots every 10 events
- Supports pause/resume
- Records audio via `AudioRecorder` (WebM chunks)

### AI Integration

- **OpenRouter** (`src/openrouter/chatCompletion.ts`): Single `chatCompletion()` function with retry logic (3 retries, exponential backoff), 2-minute timeout. Used by judge, chatbot, and question gen.
- **Gemini** (`src/gemini/client.ts`): `transcribeAudio()` converts audio blobs to base64, sends to Gemini with structured JSON output schema. Supports chunked transcription for long audio.

## Conventions

- **TypeScript strict mode** — `strict: true` in tsconfig
- **No default exports** — everything uses named exports
- **Type imports** — use `import type` for type-only imports
- **Functional React** — no class components, hooks only
- **State in App.tsx** — main application state lives in `AppContent`, not in a state management library
- **CSS** — all styles in `src/styles.css`, no CSS modules or CSS-in-JS
- **No utility libraries** — no lodash, no axios. Uses native `fetch`, `crypto.randomUUID()`, etc.

## Commands

```bash
npm run dev          # Start dev server + Electron
npm run build        # TypeScript compile + Vite build
npm run dist:mac     # Build + package for macOS
npm run dist:linux   # Build + package for Linux
```

## Important Patterns

- The `window.*API` objects are typed in `src/vite-env.d.ts`
- Canvas theme is normalized via `normalizeCanvasTheme()` — only "dark" or "light"
- The Excalidraw component is keyed by `activeCanvasId` to force remount on canvas switch
- Recording sessions include a `schemaVersion` field (currently "1.3")
- The judge prompt is in `src/judge/buildJudgePrompt.ts` — it constructs a system+user message pair with the full event timeline and final scene summary
- The chatbot prompt is in `src/chatbot/buildChatbotPrompt.ts` — it instructs the AI to never reveal solutions

## Common Tasks

- **Adding a new IPC channel**: Add handler in `electron/main.ts`, expose in `electron/preload.ts`, add type in `src/vite-env.d.ts`
- **Adding a new setting**: Add field to `Settings` type in `src/settings/types.ts`, update `defaultSettings`, add UI in `src/components/SettingsDialog.tsx`
- **Adding a new recorded action**: Add to `RecordedAction` union in `src/recorder/types.ts`, emit via `recorder.recordCustomEvent()`
- **Changing AI behavior**: Edit the system prompt in `buildJudgePrompt.ts`, `buildChatbotPrompt.ts`, or `generateQuestion.ts`

## Behavioral Guidelines

These guidelines reduce common LLM coding mistakes. Bias toward caution over speed.

### 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
Touch only what you must. Clean up only your own mess.

**When editing existing code:**
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

**When your changes create orphans:**
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
- **The test:** Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
Define success criteria. Loop until verified.

**Transform tasks into verifiable goals:**
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

**For multi-step tasks, state a brief plan:**
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
