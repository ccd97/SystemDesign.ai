import type { EventChanges, InteractionEvent } from "./types";

type ElementLike = Record<string, unknown>;

const rounded = (value: unknown) =>
  typeof value === "number" ? Math.round(value * 10) / 10 : value;

const point = (element: ElementLike) => `(${rounded(element.x)}, ${rounded(element.y)})`;

export function elementSnapshot(element: ElementLike) {
  return {
    type: element.type,
    x: rounded(element.x),
    y: rounded(element.y),
    width: rounded(element.width),
    height: rounded(element.height),
    angle: rounded(element.angle),
    text: element.text,
    strokeColor: element.strokeColor,
    backgroundColor: element.backgroundColor,
    fillStyle: element.fillStyle,
    strokeWidth: element.strokeWidth,
    roughness: element.roughness,
    opacity: element.opacity,
  };
}

export function summarizeDraft(
  action: InteractionEvent["action"],
  element?: ElementLike,
  changes?: EventChanges,
) {
  const type = String(element?.type ?? "element");

  switch (action) {
    case "element_created":
      return `Created ${type} at ${element ? point(element) : "the canvas"}`;
    case "element_deleted":
      return `Deleted ${type}`;
    case "element_moved":
      return `Moved ${type} from (${rounded(changes?.x?.from)}, ${rounded(
        changes?.y?.from,
      )}) to (${rounded(changes?.x?.to)}, ${rounded(changes?.y?.to)})`;
    case "element_resized":
      return `Resized ${type} from ${rounded(changes?.width?.from)}x${rounded(
        changes?.height?.from,
      )} to ${rounded(changes?.width?.to)}x${rounded(changes?.height?.to)}`;
    case "element_rotated":
      return `Rotated ${type} from ${rounded(changes?.angle?.from)} to ${rounded(
        changes?.angle?.to,
      )} radians`;
    case "element_restyled":
      return `Changed ${type} styling`;
    case "element_reshaped":
      return `Reshaped ${type}`;
    case "text_edited":
      return `Edited text from "${String(changes?.text?.from ?? "")}" to "${String(
        changes?.text?.to ?? "",
      )}"`;
    case "scene_cleared":
      return "Cleared the scene";
    default:
      return "Updated the scene";
  }
}

export function makeNarrative(events: InteractionEvent[]) {
  if (events.length === 0) {
    return "The recording did not capture any drawing changes.";
  }

  const actionCounts = events.reduce<Record<string, number>>((counts, event) => {
    counts[event.action] = (counts[event.action] ?? 0) + 1;
    return counts;
  }, {});
  const actionSummary = Object.entries(actionCounts)
    .map(([action, count]) => `${count} ${action.replaceAll("_", " ")}`)
    .join(", ");

  const firstEvents = events.slice(0, 4).map((event) => event.summary);
  const continuation = events.length > firstEvents.length ? " Additional edits followed." : "";
  return `This session recorded ${events.length} semantic event${
    events.length === 1 ? "" : "s"
  }: ${actionSummary}. It began with ${firstEvents.join("; ")}.${continuation}`;
}
