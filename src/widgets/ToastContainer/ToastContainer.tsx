import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { useToast } from "../../app/providers/ToastProvider";

const icons = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-container">
      {toasts.map((toast) => {
        const Icon = icons[toast.variant];
        return (
          <div key={toast.id} className={`toast toast-${toast.variant}`}>
            <Icon className="toast-icon" size={16} />
            <div className="toast-body">
              <span className="toast-title">{toast.title}</span>
              {toast.message ? <span className="toast-message">{toast.message}</span> : null}
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
