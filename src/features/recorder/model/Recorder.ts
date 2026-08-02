import { rounded } from "../../../shared/utils/utils";
import { AudioRecorder, type AudioChunk } from "../../../shared/lib/audio/AudioRecorder";
import {
  coalesceInteractionEvents,
  diffSnapshots,
  type InternalInteractionEvent,
  type SceneSnapshot,
} from "./diff";
import { saveRecording } from "./RecordingStore";
import type { InteractionEvent, RecordingSession, RecordedAction } from "./types";
import type { ExcalidrawElementData } from "../../../shared/types";

type SceneInput = {
  elements: readonly ExcalidrawElementData[];
  appState: Record<string, unknown>;
};

type ActiveSession = {
  sessionId: string;
  canvasId: string;
  canvasName: string;
  question?: string;
  startedAt: string;
  startedAtMs: number;
  events: InternalInteractionEvent[];
  audioFailed?: boolean;
  pausedAtMs?: number;
  totalPausedMs: number;
};

const SNAPSHOT_INTERVAL = 10;

const RECORDING_SCHEMA_VERSION = "1.3";

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function snapshot(scene: SceneInput): SceneSnapshot {
  return {
    elements: scene.elements as unknown as SceneSnapshot["elements"],
    appState: scene.appState,
  };
}

function sanitizeRecordingValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeRecordingValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      sanitizeRecordingValue(nestedValue),
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addValue(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  key: string,
  options: { defaultValue?: unknown; round?: boolean } = {},
) {
  if (!(key in source)) {
    return;
  }

  const value = options.round ? rounded(source[key]) : source[key];
  if (value == null) {
    return;
  }

  if ("defaultValue" in options && value === options.defaultValue) {
    return;
  }

  target[key] = value;
}

function compactBinding(value: unknown) {
  if (!isRecord(value) || typeof value.elementId !== "string") {
    return undefined;
  }

  return { elementId: value.elementId };
}

function compactPoints(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((point) =>
    Array.isArray(point) ? point.map((coordinate) => rounded(coordinate)) : point,
  );
}

function compactSceneElement(value: unknown) {
  if (!isRecord(value) || value.isDeleted === true) {
    return undefined;
  }

  const compact: Record<string, unknown> = {};
  addValue(compact, value, "id");
  addValue(compact, value, "type");
  addValue(compact, value, "x", { round: true });
  addValue(compact, value, "y", { round: true });
  addValue(compact, value, "width", { round: true });
  addValue(compact, value, "height", { round: true });
  addValue(compact, value, "angle", { defaultValue: 0, round: true });

  addValue(compact, value, "strokeColor");
  addValue(compact, value, "backgroundColor", { defaultValue: "transparent" });
  addValue(compact, value, "fillStyle", { defaultValue: "solid" });
  addValue(compact, value, "strokeWidth", { defaultValue: 2 });
  addValue(compact, value, "strokeStyle", { defaultValue: "solid" });
  addValue(compact, value, "roughness", { defaultValue: 1 });
  addValue(compact, value, "opacity", { defaultValue: 100 });

  addValue(compact, value, "text");
  addValue(compact, value, "originalText");
  addValue(compact, value, "containerId");
  addValue(compact, value, "baseline");
  addValue(compact, value, "fontSize");
  addValue(compact, value, "fontFamily");
  addValue(compact, value, "textAlign");
  addValue(compact, value, "verticalAlign");
  addValue(compact, value, "lineHeight");
  addValue(compact, value, "autoResize");
  addValue(compact, value, "boundElements");

  const points = compactPoints(value.points);
  if (points) {
    compact.points = points;
  }

  const startBinding = compactBinding(value.startBinding);
  if (startBinding) {
    compact.startBinding = startBinding;
  }

  const endBinding = compactBinding(value.endBinding);
  if (endBinding) {
    compact.endBinding = endBinding;
  }

  addValue(compact, value, "startArrowhead");
  addValue(compact, value, "endArrowhead");
  addValue(compact, value, "elbowed", { defaultValue: false });

  return sanitizeRecordingValue(compact);
}

function compactSceneElements(elements: readonly ExcalidrawElementData[]): ExcalidrawElementData[] {
  return elements.map(compactSceneElement).filter((element): element is ExcalidrawElementData => element != null);
}

function compactEvents(events: InternalInteractionEvent[]): InteractionEvent[] {
  const EPHEMERAL_WINDOW_MS = 2000;
  const created = new Map<string, { index: number; elapsedMs: number; hadText: boolean }>();
  const removed = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    if (event.action === "element_created" && event.elementId) {
      const text = String(event.snapshot?.text ?? "");
      created.set(event.elementId, {
        index: i,
        elapsedMs: event.elapsedMs,
        hadText: text.length > 0,
      });
      continue;
    }

    if (event.action === "text_edited" && event.elementId) {
      const info = created.get(event.elementId);
      if (info) {
        info.hadText = true;
      }
      continue;
    }

    if (event.action === "element_deleted" && event.elementId) {
      const info = created.get(event.elementId);
      if (
        info &&
        !info.hadText &&
        event.elapsedMs - info.elapsedMs <= EPHEMERAL_WINDOW_MS
      ) {
        removed.add(info.index);
        removed.add(i);
      }
      created.delete(event.elementId);
      continue;
    }
  }

  const filtered = events.filter((_, i) => !removed.has(i));

  return filtered.map((event, index) => {
    const { changes: _changes, snapshot, ...recordedEvent } = event;
    const seq = index + 1;
    const shouldKeepSnapshot = seq === 1 || seq % SNAPSHOT_INTERVAL === 0;

    return {
      ...recordedEvent,
      seq,
      ...(shouldKeepSnapshot && snapshot
        ? { snapshot: sanitizeRecordingValue(snapshot) as Record<string, unknown> }
        : {}),
    };
  });
}

export class Recorder {
  private activeSession?: ActiveSession;
  private previousSnapshot?: SceneSnapshot;
  private audioRecorder = new AudioRecorder();

  get startedAtMs() {
    return this.activeSession?.startedAtMs;
  }

  get totalPausedMs() {
    if (!this.activeSession) return 0;
    const currentPauseMs = this.activeSession.pausedAtMs ? Date.now() - this.activeSession.pausedAtMs : 0;
    return this.activeSession.totalPausedMs + currentPauseMs;
  }

  async start(canvasId: string, canvasName: string, scene: SceneInput, enableAudio = false, question?: string) {
    const now = Date.now();
    this.activeSession = {
      sessionId: makeId(),
      canvasId,
      canvasName,
      question,
      startedAt: new Date(now).toISOString(),
      startedAtMs: now,
      events: [],
      totalPausedMs: 0,
    };
    this.previousSnapshot = snapshot(scene);

    if (enableAudio) {
      try {
        await this.audioRecorder.start();
      } catch {
        if (this.activeSession) {
          this.activeSession.audioFailed = true;
        }
      }
    }

    return this.activeSession;
  }

  recordChange(scene: SceneInput) {
    const currentSnapshot = snapshot(scene);
    if (!this.activeSession || this.activeSession.pausedAtMs) {
      this.previousSnapshot = currentSnapshot;
      return [];
    }

    const drafts = diffSnapshots(this.previousSnapshot, currentSnapshot);
    const now = Date.now();
    const nextEvents = drafts.map<InternalInteractionEvent>((draft, index) => ({
      ...draft,
      seq: this.activeSession!.events.length + index + 1,
      timestamp: new Date(now).toISOString(),
      elapsedMs: now - this.activeSession!.startedAtMs,
    }));

    this.activeSession.events = coalesceInteractionEvents([
      ...this.activeSession.events,
      ...nextEvents,
    ]);
    this.previousSnapshot = currentSnapshot;
    return this.activeSession.events;
  }

  pause(): void {
    if (!this.activeSession || this.activeSession.pausedAtMs) return;
    this.activeSession.pausedAtMs = Date.now();
    this.audioRecorder.pause();
  }

  resume(): void {
    if (!this.activeSession || !this.activeSession.pausedAtMs) return;
    this.activeSession.totalPausedMs += Date.now() - this.activeSession.pausedAtMs;
    this.activeSession.pausedAtMs = undefined;
    this.audioRecorder.resume();
  }

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

  async stop(scene: SceneInput) {
    if (!this.activeSession) {
      return undefined;
    }

    if (this.activeSession.events.length === 0) {
      this.activeSession = undefined;
      this.previousSnapshot = snapshot(scene);
      return undefined;
    }

    let audioBlob: Blob | undefined;
    let audioChunks: AudioChunk[] | undefined;
    if (this.audioRecorder.isRecording || this.audioRecorder.isPaused) {
      const result = await this.audioRecorder.stop();
      audioBlob = result.blob;
      audioChunks = result.chunks;
    }

    const endedAtMs = Date.now();
    const pausedMs = this.activeSession.pausedAtMs
      ? endedAtMs - this.activeSession.pausedAtMs
      : 0;
    const totalPausedMs = this.activeSession.totalPausedMs + pausedMs;
    const events = compactEvents(this.activeSession.events);
    const session: RecordingSession & { audioBlob?: Blob; audioChunks?: AudioChunk[] } = {
      schemaVersion: RECORDING_SCHEMA_VERSION,
      app: "system-design-ai",
      sessionId: this.activeSession.sessionId,
      canvasId: this.activeSession.canvasId,
      canvasName: this.activeSession.canvasName,
      question: this.activeSession.question,
      startedAt: this.activeSession.startedAt,
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: endedAtMs - this.activeSession.startedAtMs - totalPausedMs,
      eventCount: events.length,
      events,
      finalScene: {
        elements: compactSceneElements(scene.elements),
        appState: {
          viewBackgroundColor: String(
            scene.appState?.viewBackgroundColor ||
              (scene.appState?.theme === "dark" ? "#121212" : "#ffffff"),
          ),
          theme: String(scene.appState?.theme || "dark"),
        },
      },
      hasAudio: Boolean(audioBlob),
      audioMimeType: audioBlob?.type,
    };

    this.activeSession = undefined;
    this.previousSnapshot = snapshot(scene);

    const { audioBlob: _blob, audioChunks: _chunks, ...sessionForSave } = session;
    await saveRecording(session.canvasId, sessionForSave);

    if (audioBlob) {
      session.audioBlob = audioBlob;
    }
    if (audioChunks) {
      session.audioChunks = audioChunks;
    }
    return session;
  }
}
