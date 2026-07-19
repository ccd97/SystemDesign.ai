import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, Copy, Download, Loader2, Pause, Play, Scale, Trash2, X } from "lucide-react";
import { deleteRecording, loadAudioBlob, recordingFilename, sessionToJson } from "../recorder/RecordingStore";
import type { RecordingSession } from "../recorder/types";
import type { JudgeReport } from "../judge/types";
import type { JudgeStatus } from "../judge/runJudge";
import type { TranscriptionStatus } from "../recorder/TranscriptionJob";
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

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

function AudioPlayer({ audioUrl }: { audioUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (duration === 0 && Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onDurationChange = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnded = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioUrl]);

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
  }, []);

  return (
    <div className="audio-player">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
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
                      <CheckCircle2 size={12} style={{ color: "#69db7c" }} />
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

        {audioUrl && <AudioPlayer audioUrl={audioUrl} />}



        <section className="event-section">
          <h3>
            <Activity size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "6px" }} />
            Event Log
          </h3>
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
  );
}
