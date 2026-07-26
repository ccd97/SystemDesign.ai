import type { ChatbotMessage } from "../../../shared/types";

export type { ChatbotMessage };

export type ChatbotState = {
  isOpen: boolean;
  interviewQuestion: string;
  interviewQuestionFull: string;
  messages: ChatbotMessage[];
  isThinking: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  voiceTranscript: string;
  error?: string;
};
