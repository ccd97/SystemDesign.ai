import { formatDuration } from "../../../shared/utils/utils";
import { CheckCircle2, TrendingUp, X } from "lucide-react";
import type { JudgeReport as JudgeReportType } from "../model/types";
import { Button } from "../../../shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/components/ui/dialog";

type JudgeReportProps = {
  report: JudgeReportType;
  canvasName: string;
  durationMs: number;
  question?: string;
  onClose: () => void;
};

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
          style={
            {
              "--si": i,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function JudgeReportDialog({ report, canvasName, durationMs, question, onClose }: JudgeReportProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="judge-report" overlayClassName="judge-report-overlay" showClose={false}>
        <DialogHeader className="judge-report-header">
          <div className="judge-report-header-text">
            <p className="eyebrow">Judge Report</p>
            <DialogTitle>{canvasName}</DialogTitle>
            <DialogDescription className="sr-only">
              Judge evaluation report for {canvasName}.
            </DialogDescription>
            <div className="detail-meta">
              <span>{formatDuration(durationMs)}</span>
              <span className="judge-model-name">{report.model}</span>
            </div>
          </div>
          <div className="judge-report-header-right">
            <div
              className={`judge-overall-score judge-overall-score--${report.overallScore}`}
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
          {question && (
            <section className="judge-section">
              <h3>Question</h3>
              <p className="judge-question">{question}</p>
            </section>
          )}

          <section className="judge-section">
            <h3>Dimensions</h3>
            <div className="judge-dimensions">
              {report.dimensions.map((dim, index) => (
                <div key={dim.name} className="judge-dimension" style={{ '--i': index } as React.CSSProperties}>
                  <div className="judge-dimension-header">
                    <span className="judge-dimension-name">{dim.name}</span>
                    <ScoreBar score={dim.score} />
                  </div>
                  <ul className="judge-dimension-observations">
                    {dim.observations.map((obs, j) => (
                      <li key={j}>{obs}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="judge-section">
            <div className="judge-columns">
              <div className="judge-column judge-strengths">
                <h3><CheckCircle2 size={13} className="inline-block align-middle mr-1.5 text-green-500" />Strengths</h3>
                <ul>
                  {report.strengths.map((s, i) => (
                    <li key={i} className="judge-point">{s}</li>
                  ))}
                </ul>
              </div>
              <div className="judge-column judge-improvements">
                <h3><TrendingUp size={13} className="inline-block align-middle mr-1.5 text-yellow-400" />Improvements</h3>
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
