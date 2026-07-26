import type { Settings } from "../../../entities/settings/model/types";

export type { Settings } from "../../../entities/settings/model/types";
export { defaultSettings } from "../../../entities/settings/model/types";

export type SettingsValidationError = {
  field: keyof Settings;
  message: string;
};

export function validateSettings(settings: Settings): SettingsValidationError[] {
  const errors: SettingsValidationError[] = [];

  if (!settings.openRouterApiKey.trim()) {
    errors.push({ field: "openRouterApiKey", message: "OpenRouter API key is required" });
  }
  if (!settings.geminiApiKey.trim()) {
    errors.push({ field: "geminiApiKey", message: "Gemini API key is required" });
  }

  return errors;
}

