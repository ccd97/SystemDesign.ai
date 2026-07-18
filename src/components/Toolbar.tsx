import { Activity, Copy, Download, Moon, Radio, Square, Sun, Timer } from "lucide-react";
import type { CanvasTheme } from "../canvas/CanvasStore";
import { Button } from "./ui/button";

type ToolbarProps = {
  isRecording: boolean;
  eventCount: number;
  durationMs: number;
  theme: CanvasTheme;
  hasRecording: boolean;
  onThemeChange: (theme: CanvasTheme) => void;
  onStart: () => void;
  onStop: () => void;
  onCopy: () => void;
  onDownload: () => void;
};

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function Toolbar({
  isRecording,
  eventCount,
  durationMs,
  theme,
  hasRecording,
  onThemeChange,
  onStart,
  onStop,
  onCopy,
  onDownload,
}: ToolbarProps) {
  return (
    <div className="toolbar" role="group" aria-label="Canvas controls">
      <div className="theme-toggle" role="group" aria-label="Theme">
        <Button
          type="button"
          className="theme-toggle-button"
          variant={theme === "light" ? "default" : "ghost"}
          size="icon"
          aria-pressed={theme === "light"}
          aria-label="Use light theme"
          title="Light theme"
          onClick={() => onThemeChange("light")}
        >
          <Sun aria-hidden="true" size={13} />
        </Button>
        <Button
          type="button"
          className="theme-toggle-button"
          variant={theme === "dark" ? "default" : "ghost"}
          size="icon"
          aria-pressed={theme === "dark"}
          aria-label="Use dark theme"
          title="Dark theme"
          onClick={() => onThemeChange("dark")}
        >
          <Moon aria-hidden="true" size={13} />
        </Button>
      </div>
      <div
        className={`recording-control-strip ${isRecording ? "recording" : ""}`}
        role="group"
        aria-label="Recording controls"
      >
        <span
          className="recording-state-dot"
          aria-label={isRecording ? "Recording" : "Ready"}
          title={isRecording ? "Recording" : "Ready"}
        />
        <span className="metric-pill" title="Duration">
          <Timer aria-hidden="true" size={13} />
          <span>{formatDuration(durationMs)}</span>
        </span>
        <span className="metric-pill" title="Recorded events">
          <Activity aria-hidden="true" size={13} />
          <span>{eventCount}</span>
        </span>
        <div className="toolbar-actions">
          {isRecording ? (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={onStop}
              aria-label="Stop recording"
              title="Stop recording"
            >
              <Square aria-hidden="true" size={14} />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              onClick={onStart}
              aria-label="Start recording"
              title="Start recording"
            >
              <Radio aria-hidden="true" size={14} />
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            disabled={!hasRecording}
            onClick={onCopy}
            aria-label="Copy recording JSON"
            title="Copy recording JSON"
          >
            <Copy aria-hidden="true" size={14} />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            disabled={!hasRecording}
            onClick={onDownload}
            aria-label="Download recording"
            title="Download recording"
          >
            <Download aria-hidden="true" size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
