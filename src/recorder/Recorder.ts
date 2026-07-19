import { AudioRecorder, type AudioChunk } from "./AudioRecorder";
import {
  coalesceInteractionEvents,
  diffSnapshots,
  type InternalInteractionEvent,
  type SceneSnapshot,
} from "./diff";
import { saveRecording } from "./RecordingStore";
import type { InteractionEvent, RecordingSession, RecordedAction } from "./types";

type SceneInput = {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
};

type ActiveSession = {
  sessionId: string;
  canvasId: string;
  canvasName: string;
  startedAt: string;
  startedAtMs: number;
  events: InternalInteractionEvent[];
  audioFailed?: boolean;
};

const SNAPSHOT_INTERVAL = 10;
const OMITTED_RECORDING_KEYS = new Set(["tool_selected"]);
const OMITTED_EVENT_ACTIONS = new Set(["tool_selected"]);

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function snapshot(scene: SceneInput): SceneSnapshot {
  return {
    elements: scene.elements as Record<string, unknown>[] as SceneSnapshot["elements"],
    appState: scene.appState,
  };
}

const rounded = (value: unknown) =>
  typeof value === "number" ? Math.round(value * 10) / 10 : value;

function sanitizeRecordingValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeRecordingValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !OMITTED_RECORDING_KEYS.has(key))
      .map(([key, nestedValue]) => [key, sanitizeRecordingValue(nestedValue)]),
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
  if (value === undefined || value === null) {
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

  addValue(compact, value, "strokeColor", { defaultValue: "#1e1e1e" });
  addValue(compact, value, "backgroundColor", { defaultValue: "transparent" });
  addValue(compact, value, "fillStyle", { defaultValue: "solid" });
  addValue(compact, value, "strokeWidth", { defaultValue: 2 });
  addValue(compact, value, "strokeStyle", { defaultValue: "solid" });
  addValue(compact, value, "roughness", { defaultValue: 1 });
  addValue(compact, value, "opacity", { defaultValue: 100 });

  addValue(compact, value, "text");
  addValue(compact, value, "containerId");
  addValue(compact, value, "fontSize", { defaultValue: 20 });
  addValue(compact, value, "fontFamily", { defaultValue: 5 });
  addValue(compact, value, "textAlign", { defaultValue: "center" });
  addValue(compact, value, "verticalAlign", { defaultValue: "middle" });

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

function compactSceneElements(elements: readonly unknown[]) {
  return elements.map(compactSceneElement).filter((element) => element !== undefined);
}

function compactEvents(events: InternalInteractionEvent[]): InteractionEvent[] {
  return events
    .filter((event) => !OMITTED_EVENT_ACTIONS.has(String(event.action)))
    .map((event, index) => {
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

  get isRecording() {
    return Boolean(this.activeSession);
  }

  get eventCount() {
    return this.activeSession?.events.length ?? 0;
  }

  get startedAtMs() {
    return this.activeSession?.startedAtMs;
  }

  setBaseline(scene: SceneInput) {
    this.previousSnapshot = snapshot(scene);
  }

  async start(canvasId: string, canvasName: string, scene: SceneInput, enableAudio = false) {
    const now = Date.now();
    this.activeSession = {
      sessionId: makeId(),
      canvasId,
      canvasName,
      startedAt: new Date(now).toISOString(),
      startedAtMs: now,
      events: [],
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
    if (!this.activeSession) {
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
    if (this.audioRecorder.isRecording) {
      const result = await this.audioRecorder.stop();
      audioBlob = result.blob;
      audioChunks = result.chunks;
    }

    const endedAtMs = Date.now();
    const events = compactEvents(this.activeSession.events);
    const session: RecordingSession & { audioBlob?: Blob; audioChunks?: AudioChunk[] } = {
      schemaVersion: "1.3",
      app: "excalidraw-recorder",
      sessionId: this.activeSession.sessionId,
      canvasId: this.activeSession.canvasId,
      canvasName: this.activeSession.canvasName,
      startedAt: this.activeSession.startedAt,
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: endedAtMs - this.activeSession.startedAtMs,
      eventCount: events.length,
      events,
      finalScene: {
        elements: compactSceneElements(scene.elements),
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
