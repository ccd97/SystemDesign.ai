import { useCallback, useRef, useState } from "react";
import type { ChatbotMessage, ChatbotState } from "../../entities/chatbot";
import type { RecordedAction } from "../../features/recorder";
import { askChatbot } from "../../features/chatbot";
import { VoiceInput } from "../../features/chatbot";
import type { Settings } from "../../features/settings";

const defaultChatbotState: ChatbotState = {
  isOpen: false,
  interviewQuestion: "",
  interviewQuestionFull: "",
  messages: [],
  isThinking: false,
  isListening: false,
  isTranscribing: false,
  voiceTranscript: "",
};

type ChatbotProcessOptions = {
  settings: Settings;
  chatbotStateRef: React.MutableRefObject<ChatbotState>;
  startedAtMs?: number;
  onRecordCustomEvent?: (action: RecordedAction, summary: string) => void;
};

export function useChatbotProcess(options: ChatbotProcessOptions) {
  const { settings, chatbotStateRef, startedAtMs, onRecordCustomEvent } = options;
  const [chatbotState, setChatbotState] = useState<ChatbotState>(defaultChatbotState);
  const voiceInputRef = useRef<VoiceInput>();

  const updateChatbotState = useCallback((updater: (prev: ChatbotState) => ChatbotState) => {
    setChatbotState((prev) => {
      const next = updater(prev);
      chatbotStateRef.current = next;
      return next;
    });
  }, [chatbotStateRef]);

  const handleSend = useCallback(
    async (question: string, source: "text" | "voice") => {
      const current = chatbotStateRef.current;
      const userMsg: ChatbotMessage = {
        role: "user",
        text: question,
        timestamp: new Date().toISOString(),
        elapsedMs: startedAtMs ? Date.now() - startedAtMs : 0,
        source,
      };

      updateChatbotState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
        isThinking: true,
        error: undefined,
        voiceTranscript: "",
      }));

      onRecordCustomEvent?.("candidate_question", `[${source}] ${question}`);

      try {
        const response = await askChatbot(
          settings.openRouterApiKey,
          settings.fastModel,
          current.interviewQuestionFull || current.interviewQuestion,
          [...current.messages, userMsg],
          question,
        );

        const assistantMsg: ChatbotMessage = {
          role: "assistant",
          text: response,
          timestamp: new Date().toISOString(),
          elapsedMs: startedAtMs ? Date.now() - startedAtMs : 0,
          source: "text",
        };

        updateChatbotState((prev) => ({
          ...prev,
          messages: [...prev.messages, assistantMsg],
          isThinking: false,
        }));

        onRecordCustomEvent?.("interviewer_response", response);
      } catch (e) {
        updateChatbotState((prev) => ({
          ...prev,
          isThinking: false,
          error: e instanceof Error ? e.message : "Failed to get response",
        }));
      }
    },
    [settings, chatbotStateRef, startedAtMs, onRecordCustomEvent, updateChatbotState],
  );

  const handleStartListening = useCallback(() => {
    if (!voiceInputRef.current) {
      voiceInputRef.current = new VoiceInput(settings.geminiApiKey, settings.audioModel);
    } else {
      voiceInputRef.current.updateModel(settings.audioModel);
    }
    voiceInputRef.current.setOnPartialTranscript((text) => {
      updateChatbotState((prev) => ({ ...prev, voiceTranscript: text }));
    });
    voiceInputRef.current.startListening();
    updateChatbotState((prev) => ({ ...prev, isListening: true, voiceTranscript: "" }));
  }, [settings, updateChatbotState]);

  const handleStopListening = useCallback(async () => {
    if (!voiceInputRef.current) return;
    updateChatbotState((prev) => ({ ...prev, isListening: false, isTranscribing: true }));
    try {
      const text = await voiceInputRef.current.stopAndTranscribe();
      if (text.trim()) {
        const { isThinking } = chatbotStateRef.current;
        if (!isThinking) {
          await handleSend(text.trim(), "voice");
        } else {
          updateChatbotState((prev) => ({ ...prev, voiceTranscript: "", error: "Still processing previous message" }));
        }
      }
    } catch (err) {
      updateChatbotState((prev) => ({
        ...prev,
        isTranscribing: false,
        error: err instanceof Error ? err.message : "Voice transcription failed",
      }));
    } finally {
      updateChatbotState((prev) => ({ ...prev, isTranscribing: false, voiceTranscript: "" }));
    }
  }, [handleSend, updateChatbotState]);

  const clearMessages = useCallback(() => {
    updateChatbotState((prev) => ({ ...prev, messages: [], error: undefined }));
  }, [updateChatbotState]);

  const toggleOpen = useCallback(() => {
    updateChatbotState((prev) => ({ ...prev, isOpen: !prev.isOpen }));
  }, [updateChatbotState]);

  const setQuestion = useCallback((full: string, short: string) => {
    updateChatbotState((prev) => ({ ...prev, interviewQuestion: short, interviewQuestionFull: full }));
  }, [updateChatbotState]);

  return {
    chatbotState,
    handleSend,
    handleStartListening,
    handleStopListening,
    toggleOpen,
    setQuestion,
    clearMessages,
  };
}
