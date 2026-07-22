import { useEffect, useState } from "react";
import { Cpu, Key, ToggleLeft } from "lucide-react";
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
import { useSettings } from "../context/SettingsContext";
import { validateSettings, type Settings, type SettingsValidationError } from "../features/settings/types";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, updateSettings } = useSettings();
  const [form, setForm] = useState<Settings>(settings);
  const [errors, setErrors] = useState<SettingsValidationError[]>([]);

  useEffect(() => {
    if (open) {
      setForm(settings);
      setErrors([]);
    }
  }, [open, settings]);

  function getFieldError(field: keyof Settings): string | undefined {
    return errors.find((e) => e.field === field)?.message;
  }

  function handleSave() {
    const validationErrors = validateSettings(form);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    updateSettings(form);
    onOpenChange(false);
  }

  function patch<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => prev.filter((e) => e.field !== key));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog" showClose>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure API keys, models, and feature toggles.</DialogDescription>
        </DialogHeader>

        <section className="settings-section">
          <div className="settings-section-heading">
            <Key size={14} />
            <span>API Keys</span>
          </div>
          <label className="settings-field">
            OpenRouter API Key
            <Input
              type="password"
              placeholder="sk-or-..."
              value={form.openRouterApiKey}
              onChange={(e) => patch("openRouterApiKey", e.target.value)}
              className={getFieldError("openRouterApiKey") ? "input--error" : ""}
            />
            {getFieldError("openRouterApiKey") && (
              <span className="settings-field-error">{getFieldError("openRouterApiKey")}</span>
            )}
            <span className="settings-field-hint">Used for judge, question gen, and chatbot</span>
          </label>
          <label className="settings-field">
            Gemini API Key
            <Input
              type="password"
              placeholder="AIza..."
              value={form.geminiApiKey}
              onChange={(e) => patch("geminiApiKey", e.target.value)}
              className={getFieldError("geminiApiKey") ? "input--error" : ""}
            />
            {getFieldError("geminiApiKey") && (
              <span className="settings-field-error">{getFieldError("geminiApiKey")}</span>
            )}
            <span className="settings-field-hint">Used for audio transcription via Google AI</span>
          </label>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <Cpu size={14} />
            <span>Models</span>
          </div>
          <div className="settings-field">
            Audio transcription model
            <Input
              value={form.audioModel}
              onChange={(e) => patch("audioModel", e.target.value)}
            />
            <span className="settings-field-hint">Gemini model for audio → text</span>
          </div>
          <label className="settings-field">
            Smart model (reasoning)
            <Input
              value={form.smartModel}
              onChange={(e) => patch("smartModel", e.target.value)}
            />
            <span className="settings-field-hint">Used for judge evaluation</span>
          </label>
          <label className="settings-field">
            Fast model (quick tasks)
            <Input
              value={form.fastModel}
              onChange={(e) => patch("fastModel", e.target.value)}
            />
            <span className="settings-field-hint">Used for question gen and chatbot</span>
          </label>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <ToggleLeft size={14} />
            <span>Features</span>
          </div>
          <div className="settings-toggles">
            <button
              type="button"
              className={`settings-toggle ${form.enableAudioRecording ? "settings-toggle--on" : ""}`}
              onClick={() => patch("enableAudioRecording", !form.enableAudioRecording)}
            >
              <span className="settings-toggle-dot" />
              Audio Recording
            </button>
            <button
              type="button"
              className={`settings-toggle ${form.enableJudge ? "settings-toggle--on" : ""}`}
              onClick={() => patch("enableJudge", !form.enableJudge)}
            >
              <span className="settings-toggle-dot" />
              Judge
            </button>
            <button
              type="button"
              className={`settings-toggle ${form.enableQuestionGen ? "settings-toggle--on" : ""}`}
              onClick={() => patch("enableQuestionGen", !form.enableQuestionGen)}
            >
              <span className="settings-toggle-dot" />
              Question Gen
            </button>
            <button
              type="button"
              className={`settings-toggle ${form.enableChatbot ? "settings-toggle--on" : ""}`}
              onClick={() => patch("enableChatbot", !form.enableChatbot)}
            >
              <span className="settings-toggle-dot" />
              Chatbot
            </button>
          </div>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
