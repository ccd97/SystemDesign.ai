# Agent Instructions

## Project

SystemDesign.ai — an Electron + React + TypeScript desktop app for system design interview practice. Users draw on an Excalidraw canvas, record sessions with audio, chat with an AI interviewer, and get AI-scored evaluations.

## Stack

- Electron 31, React 18, TypeScript (strict), Vite, Excalidraw 0.18
- Radix UI primitives, Lucide icons, vanilla CSS (`src/styles.css`)
- No Tailwind, no state management library, no utility libraries

## Structure

```
electron/
  main.ts          # Main process — all file I/O via IPC handlers
  preload.ts       # Context bridge — exposes canvasAPI, recordingAPI, settingsAPI, recorderAPI
src/
  App.tsx           # Root component, all app state lives here
  canvas/           # Canvas CRUD & Excalidraw serialization
  recorder/         # Recording engine (diff-based), AudioRecorder, transcription merge
  chatbot/          # AI interviewer chatbot (prompts + runner)
  judge/            # AI judge scoring (prompts + runner)
  questions/        # Interview question generator
  openrouter/       # OpenRouter chat completion client (retries, timeouts)
  gemini/           # Gemini audio transcription client
  settings/         # Settings types, defaults, validation, React context
  components/       # All React UI components
  styles.css        # All CSS (single file)
  vite-env.d.ts     # Window API type declarations
```

## Key Patterns

- **IPC bridge**: Main process handles file I/O. Renderer calls `window.canvasAPI.*`, `window.recordingAPI.*`, etc. Types declared in `vite-env.d.ts`.
- **No database**: JSON files stored in `userData/canvases/`. Canvas index at `index.json`, canvas data as `.excalidraw`, recordings as `{sessionId}.json`, audio as `.webm`, judge reports as `.judge.json`.
- **Recording engine**: `Recorder` class diffs Excalidraw scene snapshots to produce semantic events (element_created, element_moved, text_edited, etc.). Coalesces rapid changes. Periodic snapshots every 10 events.
- **AI calls**: All go through `chatCompletion()` in `src/openrouter/chatCompletion.ts` (3 retries, exponential backoff, 2min timeout). Audio transcription uses Gemini directly in `src/gemini/client.ts`.
- **Named exports only** — no default exports anywhere.
- **Type imports** — always use `import type` for type-only imports.
- **State management** — all state in `AppContent` component via `useState`/`useRef`. No Redux/Zustand.

## Commands

```
npm run dev          # Dev server + Electron
npm run build        # TS compile + Vite production build
npm run dist:mac     # Package macOS .dmg
npm run dist:linux   # Package Linux .AppImage
```

## How to Add Things

- **New IPC channel**: handler in `electron/main.ts` → expose in `electron/preload.ts` → type in `src/vite-env.d.ts`
- **New setting**: field in `src/settings/types.ts` (type + default) → UI in `src/components/SettingsDialog.tsx`
- **New recorded action**: add to `RecordedAction` union in `src/recorder/types.ts` → emit via `recorder.recordCustomEvent()`
- **Change AI prompts**: edit `src/judge/buildJudgePrompt.ts`, `src/chatbot/buildChatbotPrompt.ts`, or `src/questions/generateQuestion.ts`

## Rules

- Keep all styles in `src/styles.css` — no CSS modules, no CSS-in-JS, no Tailwind
- Use native APIs (`fetch`, `crypto.randomUUID()`) — no axios, no lodash
- Functional components only, hooks only — no class components
- TypeScript strict mode — no `any` unless unavoidable (Excalidraw types are loose)
- Canvas theme must go through `normalizeCanvasTheme()` — only "dark" or "light"
- Excalidraw component is keyed by `activeCanvasId` to force remount on switch
- Recording schema version is "1.3" — bump if changing the session format

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
