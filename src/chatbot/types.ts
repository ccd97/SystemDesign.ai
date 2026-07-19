export type ChatbotMessage = {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  elapsedMs: number;
  source: "text" | "voice";
};

export type ChatbotState = {
  isOpen: boolean;
  interviewQuestion: string;
  interviewQuestionFull: string;
  messages: ChatbotMessage[];
  isThinking: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  error?: string;
};
