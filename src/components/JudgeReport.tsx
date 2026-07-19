import { CheckCircle2, TrendingUp, X } from "lucide-react";
import type { JudgeReport as JudgeReportType } from "../judge/types";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

type JudgeReportProps = {
  report: JudgeReportType;
  canvasName: string;
  durationMs: number;
  onClose: () => void;
};

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function scoreColor(score: number) {
  if (score <= 2) return "#ff6b6b";
  if (score === 3) return "#ffd43b";
  return "#69db7c";
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="judge-score-bar">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className={`judge-score-block ${i < score ? "judge-score-block--filled" : ""}`}
          style={i < score ? { background: scoreColor(score) } : undefined}
        />
      ))}
    </div>
  );
}

export function JudgeReport({ report, canvasName, durationMs, onClose }: JudgeReportProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="judge-report" showClose={false}>
        <DialogHeader className="judge-report-header">
          <div className="judge-report-header-text">
            <p className="eyebrow">Judge Report</p>
            <DialogTitle>{canvasName}</DialogTitle>
            <DialogDescription className="sr-only">
              Judge evaluation report for {canvasName}.
            </DialogDescription>
            <div className="detail-meta">
              <span>{formatDuration(durationMs)}</span>
              <span>{report.model}</span>
            </div>
          </div>
          <div className="judge-report-header-right">
            <div
              className="judge-overall-score"
              style={{ background: scoreColor(report.overallScore) }}
            >
              {report.overallScore}/5
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close judge report"
              title="Close"
            >
              <X aria-hidden="true" size={16} />
            </Button>
          </div>
        </DialogHeader>

        <div className="judge-report-body">
          <section className="judge-section">
            <h3>Summary</h3>
            <p className="judge-summary">{report.summary}</p>
          </section>

          <section className="judge-section">
            <h3>Dimensions</h3>
            <div className="judge-dimensions">
              {report.dimensions.map((dim) => (
                <div key={dim.name} className="judge-dimension">
                  <div className="judge-dimension-header">
                    <span className="judge-dimension-name">{dim.name}</span>
                    <ScoreBar score={dim.score} />
                  </div>
                  <p className="judge-dimension-observations">{dim.observations}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="judge-section">
            <div className="judge-columns">
              <div className="judge-column judge-strengths">
                <h3><CheckCircle2 size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: "6px", color: "#69db7c" }} />Strengths</h3>
                <ul>
                  {report.strengths.map((s, i) => (
                    <li key={i} className="judge-point">{s}</li>
                  ))}
                </ul>
              </div>
              <div className="judge-column judge-improvements">
                <h3><TrendingUp size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: "6px", color: "#ffd43b" }} />Improvements</h3>
                <ul>
                  {report.improvements.map((s, i) => (
                    <li key={i} className="judge-point">{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="judge-report-footer">
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
