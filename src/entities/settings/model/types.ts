export type Settings = {
  openRouterApiKey: string;
  geminiApiKey: string;
  audioModel: string;
  smartModel: string;
  fastModel: string;
  enableAudioRecording: boolean;
  enableAudioTranscription: boolean;
  enableJudge: boolean;
  enableQuestionGen: boolean;
  enableChatbot: boolean;
};

export const defaultSettings: Settings = {
  openRouterApiKey: "",
  geminiApiKey: "",
  audioModel: "gemini-3.1-flash-live-preview",
  smartModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
  fastModel: "google/gemini-3.1-flash-lite",
  enableAudioRecording: true,
  enableAudioTranscription: true,
  enableJudge: true,
  enableQuestionGen: true,
  enableChatbot: true,
};