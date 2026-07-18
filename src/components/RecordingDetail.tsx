import { Copy, Download, Trash2, X } from "lucide-react";
import { deleteRecording, recordingFilename, sessionToJson } from "../recorder/RecordingStore";
import type { RecordingSession } from "../recorder/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";

type RecordingDetailProps = {
  session: RecordingSession;
  onClose: () => void;
  onDeleted: (session: RecordingSession) => void | Promise<void>;
};

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatTimestamp(iso: string | undefined) {
  if (!iso) {
    return "Unknown time";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function eventTimestamp(session: RecordingSession, event: RecordingSession["events"][number]) {
  if (event.timestamp) {
    return event.timestamp;
  }
  if (typeof event.elapsedMs === "number") {
    const startedAtMs = new Date(session.startedAt).getTime();
    if (!Number.isNaN(startedAtMs)) {
      return new Date(startedAtMs + event.elapsedMs).toISOString();
    }
  }
  return undefined;
}

function RecordingEventItem({
  event,
  session,
}: {
  event: RecordingSession["events"][number];
  session: RecordingSession;
}) {
  const timestamp = eventTimestamp(session, event);

  return (
    <li key={`${event.seq}-${timestamp ?? event.action}`} className={`event-log-item event-log-item--${event.action}`}>
      <div className="event-log-heading">
        <strong className="event-title">
          <span className="event-seq">#{event.seq}</span>
          <span>{event.action.replaceAll("_", " ")}</span>
        </strong>
        <span className="event-time">{formatTimestamp(timestamp)}</span>
      </div>
      <p className="event-summary">{event.summary}</p>
    </li>
  );
}

export function RecordingDetail({ session, onClose, onDeleted }: RecordingDetailProps) {
  const json = sessionToJson(session);

  async function handleCopy() {
    await navigator.clipboard.writeText(json);
  }

  async function handleDownload() {
    await window.recorderAPI.export(recordingFilename(session), json);
  }

  async function handleDelete() {
    if (!window.confirm("Delete this recording? This cannot be undone.")) {
      return;
    }
    try {
      await deleteRecording(session.canvasId, session.sessionId);
      await onDeleted(session);
    } catch (error) {
      console.error("Failed to delete recording", error);
      window.alert("Could not delete the recording. Please try again.");
    }
  }

  const events = Array.isArray(session.events) ? session.events : [];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="recording-detail" showClose={false}>
        <DialogHeader className="recording-detail-header">
          <div>
            <p className="eyebrow">Recording</p>
            <DialogTitle>{session.canvasName}</DialogTitle>
            <DialogDescription className="sr-only">
              Recorded interaction details for {session.canvasName}.
            </DialogDescription>
            <div className="detail-meta">
              <span>{new Date(session.startedAt).toLocaleString()}</span>
              <span>{formatDuration(session.durationMs)}</span>
              <Badge variant="secondary">{session.eventCount} events</Badge>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close recording details"
            title="Close"
          >
            <X aria-hidden="true" size={16} />
          </Button>
        </DialogHeader>

        <section className="event-section">
          <h3>Event Log</h3>
          <ScrollArea className="event-scroll">
            <ol className="event-log">
              {events.map((event) => (
                <RecordingEventItem
                  key={`${event.seq}-${eventTimestamp(session, event) ?? event.action}`}
                  event={event}
                  session={session}
                />
              ))}
            </ol>
          </ScrollArea>
          {events.length === 0 ? (
            <p className="empty-state">No semantic drawing changes were captured.</p>
          ) : null}
        </section>

        <DialogFooter className="recording-detail-footer">
          <Button type="button" variant="secondary" onClick={handleCopy}>
            <Copy aria-hidden="true" size={14} />
            Copy
          </Button>
          <Button type="button" variant="secondary" onClick={handleDownload}>
            <Download aria-hidden="true" size={14} />
            Download
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete}>
            <Trash2 aria-hidden="true" size={14} />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
