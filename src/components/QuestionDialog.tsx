import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { domains } from "../questions/generateQuestion";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

type QuestionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isGenerating: boolean;
  onGenerate: (domain: string | null, context: string) => void;
};

export function QuestionDialog({
  open,
  onOpenChange,
  isGenerating,
  onGenerate,
}: QuestionDialogProps) {
  const [selectedDomain, setSelectedDomain] = useState<string>("random");
  const [context, setContext] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const domain = selectedDomain === "random" ? null : selectedDomain;
    onGenerate(domain, context.trim());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onEscapeKeyDown={isGenerating ? (e) => e.preventDefault() : undefined}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Generate Question</DialogTitle>
            <DialogDescription>
              Choose a domain or let the AI pick randomly. Add optional context to guide the question.
            </DialogDescription>
          </DialogHeader>

          <label className="field-label">
            Domain
            <select
              className="ui-select"
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
            >
              <option value="random">Random</option>
              {domains.map((domain) => (
                <option key={domain} value={domain}>{domain}</option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Context / Question hint
            <textarea
              className="ui-textarea"
              rows={3}
              placeholder="e.g. Focus on scalability, include real-time features..."
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </label>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 size={14} className="spin" /> Generating...
                </>
              ) : (
                "Generate"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
