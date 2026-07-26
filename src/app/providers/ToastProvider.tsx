import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type ToastVariant = "error" | "warning" | "info";

type Toast = {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
  duration: number;
};

type ToastInput = {
  title: string;
  message?: string;
  variant?: ToastVariant;
  duration?: number;
};

type ToastContextValue = {
  toasts: Toast[];
  addToast: (input: ToastInput) => void;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const addToast = useCallback(
    (input: ToastInput) => {
      const id = `toast-${++counterRef.current}`;
      const toast: Toast = {
        id,
        title: input.title,
        message: input.message,
        variant: input.variant ?? "error",
        duration: input.duration ?? 5000,
      };
      setToasts((prev) => [...prev, toast]);

      if (toast.duration > 0) {
        const timer = setTimeout(() => removeToast(id), toast.duration);
        timersRef.current.set(id, timer);
      }
    },
    [removeToast],
  );

  const value = useMemo(() => ({ toasts, addToast, removeToast }), [toasts, addToast, removeToast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  return useContext(ToastContext);
}
