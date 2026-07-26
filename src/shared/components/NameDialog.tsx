import { FormEvent, useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

type NameDialogProps = {
  title: string;
  actionLabel: string;
  initialName?: string;
  required?: boolean;
  onCancel?: () => void;
  onSubmit: (name: string) => void | Promise<void>;
};

export function NameDialog({
  title,
  actionLabel,
  initialName = "",
  required = true,
  onCancel,
  onSubmit,
}: NameDialogProps) {
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const trimmed = name.trim();

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (required && !trimmed) {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && onCancel) {
          onCancel();
        }
      }}
    >
      <DialogContent
        showClose={Boolean(onCancel)}
        onEscapeKeyDown={onCancel ? undefined : (event) => event.preventDefault()}
        onInteractOutside={onCancel ? undefined : (event) => event.preventDefault()}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Name your workspace so it is easy to find later.</DialogDescription>
          </DialogHeader>
          <label className="field-label">
            Canvas name
            <Input
              autoFocus
              value={name}
              placeholder="e.g. Flowchart"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <DialogFooter>
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" disabled={submitting || (required && !trimmed)}>
              {submitting ? "Saving..." : actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
