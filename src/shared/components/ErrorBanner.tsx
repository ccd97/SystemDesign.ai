import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

type ErrorBannerProps = {
  message: string;
  className?: string;
};

export function ErrorBanner({ message, className = "" }: ErrorBannerProps) {
  const [expanded, setExpanded] = useState(false);

  const cleanMessage = message.replace(/[\r\n]+/g, " ").trim();
  const isLong = cleanMessage.length > 120;

  return (
    <div className={`dialog-header-error-banner ${expanded ? "is-expanded" : ""} ${className}`} role="alert">
      <AlertCircle size={13} strokeWidth={2} className="dialog-header-error-icon" />
      <div className={`dialog-header-error-text ${!expanded && isLong ? "is-clamp" : ""}`}>
        {cleanMessage}
      </div>
      {isLong && (
        <button
          type="button"
          className="dialog-header-error-btn"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? "Show less" : "Show details"}
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          <span>{expanded ? "Less" : "Details"}</span>
        </button>
      )}
    </div>
  );
}
