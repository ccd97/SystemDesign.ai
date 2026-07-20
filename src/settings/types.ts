export type Settings = {
  openRouterApiKey: string;
  geminiApiKey: string;
  audioModel: string;
  smartModel: string;
  fastModel: string;
  enableAudioRecording: boolean;
  enableJudge: boolean;
  enableQuestionGen: boolean;
  enableChatbot: boolean;
};

export const defaultSettings: Settings = {
  openRouterApiKey: "",
  geminiApiKey: "",
  audioModel: "gemini-2.5-flash",
  smartModel: "openai/gpt-4o",
  fastModel: "openai/gpt-4o-mini",
  enableAudioRecording: true,
  enableJudge: true,
  enableQuestionGen: true,
  enableChatbot: true,
};

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

