import { Activity, Copy, Download, Loader2, Moon, Radio, Scale, Sparkles, Square, Sun, Timer } from "lucide-react";
import type { CanvasTheme } from "../canvas/CanvasStore";
import type { JudgeStatus } from "../judge/runJudge";
import type { QuestionGenStatus } from "../questions/types";
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
  onJudge: () => void;
  judgeStatus: JudgeStatus;
  enableJudge: boolean;
  onGenerateQuestion: () => void;
  questionGenStatus: QuestionGenStatus;
  enableQuestionGen: boolean;
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
  onJudge,
  judgeStatus,
  enableJudge,
  onGenerateQuestion,
  questionGenStatus,
  enableQuestionGen,
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
      {enableQuestionGen && !isRecording && (
        <div className="question-gen-group" role="group" aria-label="Question generation">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            disabled={questionGenStatus.state === "generating"}
            onClick={onGenerateQuestion}
            aria-label="Generate new question"
            title="New Question"
          >
            {questionGenStatus.state === "generating" ? (
              <Loader2 aria-hidden="true" size={14} className="judge-button-running" />
            ) : (
              <Sparkles aria-hidden="true" size={14} />
            )}
          </Button>
        </div>
      )}
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
          {!isRecording && hasRecording && enableJudge && (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              disabled={judgeStatus.state === "running"}
              onClick={onJudge}
              className={judgeStatus.state === "running" ? "judge-button-running" : ""}
              aria-label="Run judge evaluation"
              title="Judge"
            >
              {judgeStatus.state === "running" ? (
                <Loader2 aria-hidden="true" size={14} />
              ) : (
                <Scale aria-hidden="true" size={14} />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
