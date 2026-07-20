import { formatDuration } from "../lib/utils";
import { useState } from "react";
import {
  ChevronDown,
  Clock3,
  FileText,
  Layers3,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { CanvasMeta } from "../canvas/CanvasStore";
import type { RecordingSummary } from "../recorder/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { ScrollArea } from "./ui/scroll-area";

type SidebarProps = {
  canvases: CanvasMeta[];
  activeCanvasId?: string;
  isRecording: boolean;
  recordings: RecordingSummary[];
  onCreateCanvas: () => void;
  onRenameCanvas: (canvas: CanvasMeta) => void;
  onDeleteCanvas: (canvas: CanvasMeta) => void;
  onSelectCanvas: (canvas: CanvasMeta) => void;
  onOpenRecording: (recording: RecordingSummary) => void;
};

function formatTime(iso: string | undefined) {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function Sidebar({
  canvases,
  activeCanvasId,
  isRecording,
  recordings,
  onCreateCanvas,
  onRenameCanvas,
  onDeleteCanvas,
  onSelectCanvas,
  onOpenRecording,
}: SidebarProps) {
  const [recordingsOpen, setRecordingsOpen] = useState(false);

  return (
    <aside className="sidebar">
      <section className="sidebar-explorer">
        <div className="sidebar-section-bar">
          <div className="sidebar-section-title">
            <Layers3 aria-hidden="true" size={13} />
            <span>Canvases</span>
            <Badge variant="outline">{canvases.length}</Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="New canvas"
            onClick={onCreateCanvas}
          >
            <Plus aria-hidden="true" size={15} />
          </Button>
        </div>
        <ScrollArea className="sidebar-scroll canvas-scroll">
          <div className="canvas-list">
            {canvases.map((canvas) => (
              <div
                key={canvas.id}
                className={`canvas-row ${canvas.id === activeCanvasId ? "active" : ""}`}
              >
                <button
                  type="button"
                  className="canvas-select"
                  onClick={() => onSelectCanvas(canvas)}
                >
                  <span className="canvas-name">
                    <span className="canvas-name-text">{canvas.name}</span>
                    {canvas.id === activeCanvasId && isRecording ? (
                      <span
                        className="canvas-recording-dot"
                        aria-label="Recording"
                        title="Recording"
                      />
                    ) : null}
                  </span>
                  <span className="canvas-meta">
                    <Clock3 aria-hidden="true" size={12} />
                    Updated {formatTime(canvas.updatedAt)}
                  </span>
                </button>
                <span className="row-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Rename"
                    onClick={() => onRenameCanvas(canvas)}
                  >
                    <Pencil aria-hidden="true" size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    onClick={() => onDeleteCanvas(canvas)}
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </Button>
                </span>
              </div>
            ))}
            {canvases.length === 0 ? (
              <div className="empty-card">
                <MoreHorizontal aria-hidden="true" size={18} />
                <p>Create a canvas to begin.</p>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </section>

      <Collapsible
        open={recordingsOpen}
        onOpenChange={setRecordingsOpen}
        className="sidebar-recordings-panel"
      >
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="sidebar-collapse-bar"
            aria-label={recordingsOpen ? "Collapse recordings" : "Expand recordings"}
          >
            <ChevronDown aria-hidden="true" size={14} />
            <span>Recordings</span>
            <Badge variant="outline">{recordings.length}</Badge>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="recordings-collapsible-content">
          <div className="sidebar-scroll recordings-scroll">
            <div className="recording-list">
              {[...new Map(recordings.map((r) => [r.sessionId, r])).values()].map((recording) => (
                <button
                  type="button"
                  key={recording.sessionId}
                  className="recording-row"
                  onClick={() => onOpenRecording(recording)}
                >
                  <span className="recording-icon">
                    <FileText aria-hidden="true" size={14} />
                  </span>
                  <span className="recording-copy">
                    <span>{formatTime(recording.startedAt)}</span>
                    <small>{formatDuration(recording.durationMs)}</small>
                  </span>
                  <Badge variant="secondary">{recording.eventCount} events</Badge>
                </button>
              ))}
              {recordings.length === 0 ? (
                <div className="empty-card">
                  <FileText aria-hidden="true" size={18} />
                  <p>No recordings for this canvas yet.</p>
                </div>
              ) : null}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </aside>
  );
}
