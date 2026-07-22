import { formatDuration } from "../utils/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, Copy, Download, Loader2, Maximize2, Pause, Play, Scale, Trash2, X } from "lucide-react";
import { exportToCanvas } from "@excalidraw/excalidraw";
import { deleteRecording, loadAudioBlob, recordingFilename, sessionToJson } from "../features/recorder/RecordingStore";
import type { RecordingSession } from "../features/recorder/types";
import type { JudgeReport } from "../features/judge/types";
import type { JudgeStatus } from "../features/judge/runJudge";
import type { TranscriptionStatus } from "../features/recorder/TranscriptionJob";
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
  onJudge?: (session: RecordingSession) => void;
  onViewReport?: () => void;
  judgeReport?: JudgeReport;
  judgeStatus?: JudgeStatus;
  enableJudge?: boolean;
  transcriptionStatus?: TranscriptionStatus;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function eventElapsedMs(session: RecordingSession, event: RecordingSession["events"][number]): number | undefined {
  if (typeof event.elapsedMs === "number") {
    return event.elapsedMs;
  }
  if (event.timestamp) {
    const startedAtMs = new Date(session.startedAt).getTime();
    const eventMs = new Date(event.timestamp).getTime();
    if (!Number.isNaN(startedAtMs) && !Number.isNaN(eventMs)) {
      return eventMs - startedAtMs;
    }
  }
  return undefined;
}

function RecordingEventItem({
  event,
  session,
  active,
  index = 0,
}: {
  event: RecordingSession["events"][number];
  session: RecordingSession;
  active?: boolean;
  index?: number;
}) {
  const elapsed = eventElapsedMs(session, event);

  return (
    <li
      key={`${event.seq}-${event.action}`}
      data-seq={event.seq}
      className={`event-log-item event-log-item--${event.action}${active ? " is-active" : ""}`}
      style={{ '--i': Math.min(index, 15) } as React.CSSProperties}
    >
      <div className="event-log-heading">
        <strong className="event-title">
          <span className="event-seq">#{event.seq}</span>
          <span>{event.action.replaceAll("_", " ")}</span>
        </strong>
        <span className="event-time">{elapsed != null ? formatTime(elapsed / 1000) : ""}</span>
      </div>
      <p className="event-summary">{event.summary}</p>
    </li>
  );
}

function AudioPlayer({ audioUrl, onTimeUpdate, duration: knownDuration }: { audioUrl: string; onTimeUpdate?: (time: number) => void; duration?: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (knownDuration && knownDuration > 0) {
      setDuration(knownDuration / 1000);
    }
  }, [knownDuration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdateHandler = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      onTimeUpdate?.(time);
    };
    const onEnded = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdateHandler);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdateHandler);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioUrl, onTimeUpdate]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  }, [playing]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
    onTimeUpdate?.(time);
  }, [onTimeUpdate]);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-player">
      <audio ref={audioRef} src={audioUrl} preload="metadata" key={audioUrl} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        title={playing ? "Pause" : "Play"}
        className="audio-player-play"
      >
        {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" style={{ marginLeft: "2px" }} />}
      </Button>
      <input
        type="range"
        className="audio-player-progress"
        min={0}
        max={duration || 0}
        value={currentTime}
        onChange={handleSeek}
        aria-label="Seek"
        style={{ '--progress': `${progressPct}%` } as React.CSSProperties}
      />
      <span className="audio-player-time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}

export function RecordingDetail({
  session,
  onClose,
  onDeleted,
  onJudge,
  onViewReport,
  judgeReport,
  judgeStatus,
  enableJudge,
  transcriptionStatus,
}: RecordingDetailProps) {
  const json = sessionToJson(session);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [generatingSnapshot, setGeneratingSnapshot] = useState(false);
  const [snapshotDims, setSnapshotDims] = useState<{ width: number; height: number } | null>(null);
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false);
  const eventLogRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setCurrentTime(0);
    setAudioUrl(null);
    setShowSnapshotDialog(false);
  }, [session]);

  useEffect(() => {
    const finalScene = session.finalScene;
    if (!finalScene || !Array.isArray(finalScene.elements) || finalScene.elements.length === 0) {
      setSnapshotUrl(null);
      setSnapshotDims(null);
      setGeneratingSnapshot(false);
      return;
    }

    const filteredElements = finalScene.elements.filter((el: any) => {
      if (!el) return false;
      if (el.isDeleted === true) return false;
      if (el.type === "text" && (!el.text || el.text.trim() === "")) return false;
      return true;
    });

    if (filteredElements.length === 0) {
      setSnapshotUrl(null);
      setSnapshotDims(null);
      setGeneratingSnapshot(false);
      return;
    }

    let active = true;
    setGeneratingSnapshot(true);

    const storedAppState = finalScene.appState;
    const generateSnapshot = async () => {
      try {
        const canvas = await exportToCanvas({
          elements: filteredElements as any,
          appState: {
            viewBackgroundColor: storedAppState?.viewBackgroundColor || "#ffffff",
            theme: storedAppState?.theme || "light",
            exportBackground: false,
          },
          files: null,
          exportPadding: 20,
        });

        if (active) {
          const url = canvas.toDataURL();
          setSnapshotUrl(url);
          setSnapshotDims({ width: canvas.width, height: canvas.height });
        }
      } catch {
        if (active) {
          setSnapshotDims(null);
        }
      } finally {
        if (active) {
          setGeneratingSnapshot(false);
        }
      }
    };

    void generateSnapshot();

    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session.hasAudio) return;
    let cancelled = false;
    let currentUrl: string | null = null;

    loadAudioBlob(session.canvasId, session.sessionId, session.audioMimeType).then((blob) => {
      if (cancelled || !blob) return;
      currentUrl = URL.createObjectURL(blob);
      setAudioUrl(currentUrl);
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [session.hasAudio, session.canvasId, session.sessionId]);

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
    } catch {
      window.alert("Could not delete the recording. Please try again.");
    }
  }

  const events = session.events;

  const eventsWithElapsed = useMemo(() => {
    const startedAtMs = new Date(session.startedAt).getTime();
    return events.map((event) => {
      let elapsedMs = 0;
      if (typeof event.elapsedMs === "number") {
        elapsedMs = event.elapsedMs;
      } else if (event.timestamp) {
        const eventTimeMs = new Date(event.timestamp).getTime();
        if (!Number.isNaN(startedAtMs) && !Number.isNaN(eventTimeMs)) {
          elapsedMs = eventTimeMs - startedAtMs;
        }
      }
      return { ...event, elapsedMs };
    });
  }, [events, session.startedAt]);

  const activeEvent = useMemo(() => {
    if (eventsWithElapsed.length === 0) return null;
    const currentMs = currentTime * 1000;

    let candidate = null;
    for (const event of eventsWithElapsed) {
      if (event.elapsedMs <= currentMs) {
        candidate = event;
      } else {
        break;
      }
    }
    return candidate;
  }, [eventsWithElapsed, currentTime]);

  const activeEventSeq = activeEvent?.seq;

  useEffect(() => {
    if (activeEventSeq !== undefined && eventLogRef.current) {
      const activeEl = eventLogRef.current.querySelector(`[data-seq="${activeEventSeq}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }
  }, [activeEventSeq]);

  return (
    <>
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
          {snapshotUrl ? (
            <button
              type="button"
              className="header-snapshot-thumbnail"
              onClick={() => setShowSnapshotDialog(true)}
              title="Click to view full final snapshot"
              aria-label="View full final snapshot"
            >
              <img
                src={snapshotUrl}
                alt="Final Canvas Thumbnail"
                className="snapshot-img"
              />
              <div className="thumbnail-overlay" />
              <div className="thumbnail-badge">
                <Maximize2 size={8} />
                <span>Zoom</span>
              </div>
            </button>
          ) : generatingSnapshot ? (
            <div className="header-snapshot-thumbnail is-loading" title="Generating snapshot...">
              <Loader2 className="spin" size={14} />
            </div>
          ) : null}

          <div className="header-info">
            <p className="eyebrow">Recording</p>
            <DialogTitle>{session.canvasName}</DialogTitle>
            <DialogDescription className="sr-only">
              Recorded interaction details for {session.canvasName}.
            </DialogDescription>
            <div className="detail-meta">
              <span>{new Date(session.startedAt).toLocaleString()}</span>
              <span>{formatDuration(session.durationMs)}</span>
              <Badge variant="secondary">{session.eventCount} events</Badge>
              {session.hasAudio && (
                <>
                  {transcriptionStatus?.state === "running" || (!session.transcription && !transcriptionStatus) ? (
                    <Badge variant="secondary" className="transcribing-badge">
                      <Loader2 className="spin" size={12} />
                      Transcribing audio...
                    </Badge>
                  ) : transcriptionStatus?.state === "error" ? (
                    <Badge variant="destructive" className="transcribing-badge">
                      <AlertCircle size={12} />
                      Transcription failed
                    </Badge>
                  ) : session.transcription ? (
                    <Badge variant="secondary" className="transcribing-badge">
                      <CheckCircle2 size={13} strokeWidth={2.5} className="transcription-check" />
                      Audio Transcribed
                    </Badge>
                  ) : null}
                </>
              )}
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

        <div className="recording-detail-body">

          {audioUrl && <AudioPlayer audioUrl={audioUrl} onTimeUpdate={setCurrentTime} duration={session.durationMs} />}

          <section className="event-section">
            <h3>
              <Activity size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "6px" }} />
              Event Log
            </h3>
            <ScrollArea className="event-scroll">
              <ol className="event-log" ref={eventLogRef}>
                {events.map((event, index) => (
                  <RecordingEventItem
                    key={`${event.seq}-${event.action}`}
                    event={event}
                    session={session}
                    active={activeEvent?.seq === event.seq}
                    index={index}
                  />
                ))}
              </ol>
            </ScrollArea>
            {events.length === 0 ? (
              <p className="empty-state">No semantic drawing changes were captured.</p>
            ) : null}
          </section>
        </div>

        <DialogFooter className="recording-detail-footer">
          <Button type="button" variant="secondary" onClick={handleCopy}>
            <Copy aria-hidden="true" size={14} />
            Copy
          </Button>
          <Button type="button" variant="secondary" onClick={handleDownload}>
            <Download aria-hidden="true" size={14} />
            Download
          </Button>
          {enableJudge && onJudge && !judgeReport && (
            <Button
              type="button"
              variant="secondary"
              disabled={judgeStatus?.state === "running"}
              onClick={() => onJudge(session)}
              className={judgeStatus?.state === "running" ? "judge-button-running" : ""}
            >
              {judgeStatus?.state === "running" ? (
                <Loader2 aria-hidden="true" size={14} />
              ) : (
                <Scale aria-hidden="true" size={14} />
              )}
              Judge
            </Button>
          )}
          {enableJudge && judgeReport && (
            <Button type="button" variant="secondary" onClick={() => onViewReport?.()}>
              <Scale aria-hidden="true" size={14} />
              View Report
            </Button>
          )}
          <Button type="button" variant="destructive" onClick={handleDelete}>
            <Trash2 aria-hidden="true" size={14} />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {showSnapshotDialog && snapshotUrl && (
      <Dialog open onOpenChange={setShowSnapshotDialog}>
        <DialogContent className="snapshot-view-dialog" overlayClassName="snapshot-view-overlay" showClose>
          <DialogHeader>
            <DialogTitle>Final Canvas Snapshot</DialogTitle>
            <DialogDescription className="sr-only">
              Enlarged final snapshot of the canvas drawing.
            </DialogDescription>
          </DialogHeader>
          <div className="snapshot-view-body">
            <img
              src={snapshotUrl}
              alt="Final Canvas Snapshot"
              className="snapshot-img"
              style={
                snapshotDims
                  ? {
                      aspectRatio: `${snapshotDims.width} / ${snapshotDims.height}`,
                    }
                  : undefined
              }
            />
          </div>
        </DialogContent>
      </Dialog>
    )}
  </>
  );
}
