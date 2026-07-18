import { elementSnapshot, summarizeDraft } from "./summary";
import type { EventChanges, InteractionEvent, RecordedAction } from "./types";

type ElementLike = Record<string, unknown> & {
  id: string;
  type?: string;
  version?: number;
  isDeleted?: boolean;
};

export type SceneSnapshot = {
  elements: ElementLike[];
  appState: Record<string, unknown>;
};

export type RecordedInteractionEventDraft = Omit<
  InteractionEvent,
  "seq" | "timestamp"
> & {
  changes?: EventChanges;
};

export type InternalInteractionEvent = InteractionEvent & {
  elapsedMs: number;
  changes?: EventChanges;
};

const styleFields = [
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "opacity",
  "fontSize",
  "fontFamily",
  "textAlign",
  "verticalAlign",
  "roundness",
];

const positionFields = ["x", "y"];
const sizeFields = ["width", "height"];

function activeElements(elements: ElementLike[]) {
  return elements.filter((element) => !element.isDeleted);
}

function elementMap(elements: ElementLike[]) {
  return new Map(elements.map((element) => [element.id, element]));
}

function fieldChanges(
  previous: ElementLike,
  next: ElementLike,
  fields: string[],
): EventChanges | undefined {
  const changes: EventChanges = {};
  for (const field of fields) {
    if (JSON.stringify(previous[field]) !== JSON.stringify(next[field])) {
      changes[field] = { from: previous[field], to: next[field] };
    }
  }
  return Object.keys(changes).length ? changes : undefined;
}

function allChanges(previous: ElementLike, next: ElementLike) {
  const interestingFields = [
    ...positionFields,
    ...sizeFields,
    "angle",
    "text",
    "points",
    ...styleFields,
  ];
  return fieldChanges(previous, next, interestingFields);
}

function classifyChange(previous: ElementLike, next: ElementLike): RecordedAction | undefined {
  if (previous.text !== next.text) {
    return "text_edited";
  }
  if (JSON.stringify(previous.points) !== JSON.stringify(next.points)) {
    return "element_reshaped";
  }
  if (positionFields.some((field) => previous[field] !== next[field])) {
    return "element_moved";
  }
  if (sizeFields.some((field) => previous[field] !== next[field])) {
    return "element_resized";
  }
  if (previous.angle !== next.angle) {
    return "element_rotated";
  }
  if (styleFields.some((field) => JSON.stringify(previous[field]) !== JSON.stringify(next[field]))) {
    return "element_restyled";
  }
  return undefined;
}

function changesForAction(
  action: RecordedAction,
  previous: ElementLike,
  next: ElementLike,
): EventChanges | undefined {
  if (action === "element_moved") {
    return fieldChanges(previous, next, positionFields);
  }
  if (action === "element_resized") {
    return fieldChanges(previous, next, sizeFields);
  }
  if (action === "element_rotated") {
    return fieldChanges(previous, next, ["angle"]);
  }
  if (action === "text_edited") {
    return fieldChanges(previous, next, ["text"]);
  }
  if (action === "element_restyled") {
    return fieldChanges(previous, next, styleFields);
  }
  return allChanges(previous, next);
}

function draft(
  action: RecordedAction,
  element?: ElementLike,
  changes?: EventChanges,
): RecordedInteractionEventDraft {
  return {
    action,
    summary: summarizeDraft(action, element, changes),
    elementId: element?.id,
    elementType: element?.type ? String(element.type) : undefined,
    changes,
    snapshot: element ? elementSnapshot(element) : undefined,
  };
}

export function diffSnapshots(
  previous: SceneSnapshot | undefined,
  next: SceneSnapshot,
): RecordedInteractionEventDraft[] {
  if (!previous) {
    return [];
  }

  const events: RecordedInteractionEventDraft[] = [];

  const previousActive = activeElements(previous.elements);
  const nextActive = activeElements(next.elements);
  if (previousActive.length > 0 && nextActive.length === 0) {
    events.push(draft("scene_cleared"));
    return events;
  }

  const previousById = elementMap(previous.elements);
  const nextById = elementMap(next.elements);

  for (const element of nextActive) {
    const oldElement = previousById.get(element.id);
    if (!oldElement || oldElement.isDeleted) {
      events.push(draft("element_created", element));
      continue;
    }

    if (oldElement.version === element.version) {
      continue;
    }

    const action = classifyChange(oldElement, element);
    if (!action) {
      continue;
    }

    events.push(draft(action, element, changesForAction(action, oldElement, element)));
  }

  for (const oldElement of previousActive) {
    const nextElement = nextById.get(oldElement.id);
    if (!nextElement || nextElement.isDeleted) {
      events.push(draft("element_deleted", oldElement));
    }
  }

  return events;
}

export function coalesceInteractionEvents(events: InternalInteractionEvent[], windowMs = 800) {
  const coalesced: InternalInteractionEvent[] = [];

  for (const event of events) {
    const last = coalesced[coalesced.length - 1];
    const sameGesture =
      last &&
      last.elementId &&
      last.elementId === event.elementId &&
      last.action === event.action &&
      event.elapsedMs - last.elapsedMs <= windowMs;

    if (!sameGesture) {
      coalesced.push(event);
      continue;
    }

    const changes = { ...(last.changes ?? {}) };
    for (const [field, change] of Object.entries(event.changes ?? {})) {
      changes[field] = {
        from: changes[field]?.from ?? change.from,
        to: change.to,
      };
    }

    coalesced[coalesced.length - 1] = {
      ...event,
      seq: last.seq,
      timestamp: last.timestamp,
      elapsedMs: last.elapsedMs,
      changes,
    };
  }

  return coalesced.map((event, index) => ({ ...event, seq: index + 1 }));
}
