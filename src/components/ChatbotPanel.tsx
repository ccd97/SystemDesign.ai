import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Mic, SendHorizontal, Square, X } from "lucide-react";
import type { ChatbotMessage, ChatbotState } from "../chatbot/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";

type ChatbotPanelProps = {
  state: ChatbotState;
  onSend: (text: string) => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onToggle: () => void;
};

function MessageBubble({ message }: { message: ChatbotMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      className={`chatbot-message ${isUser ? "chatbot-message--user" : "chatbot-message--assistant"}`}
    >
      <span className="chatbot-message-label">{isUser ? "You" : "Interviewer"}</span>
      <span>{message.text}</span>
      {isUser && message.source && (
        <span className="chatbot-message-source-tag">
          {message.source === "voice" ? "🎤 voice" : "⌨ typed"}
        </span>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="chatbot-message chatbot-message--assistant">
      <div className="chatbot-typing">
        <span className="chatbot-typing-dot" style={{ animationDelay: "0ms" }} />
        <span className="chatbot-typing-dot" style={{ animationDelay: "160ms" }} />
        <span className="chatbot-typing-dot" style={{ animationDelay: "320ms" }} />
      </div>
    </div>
  );
}

export function ChatbotPanel({
  state,
  onSend,
  onStartListening,
  onStopListening,
  onToggle,
}: ChatbotPanelProps) {
  const [input, setInput] = useState("");
  const scrollEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages.length, state.isThinking]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!state.isOpen) {
    return (
      <button type="button" className="chatbot-fab" onClick={onToggle} aria-label="Open interviewer chat">
        <MessageCircle size={22} />
        {state.messages.length > 0 && (
          <span className="chatbot-fab-badge">{state.messages.length}</span>
        )}
      </button>
    );
  }

  const hasMessages = state.messages.length > 0 || state.isThinking;

  return (
    <div className="chatbot-panel" role="dialog" aria-label="Interviewer chat">
      <div className="chatbot-header">
        <div className="chatbot-header-title">Interviewer Chat</div>
        <div className="chatbot-header-actions">
          <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onToggle}>
            <X size={15} />
          </Button>
        </div>
      </div>

      <div className="chatbot-question-bar">
        {state.interviewQuestion ? (
          <span className="chatbot-question-text">📋 {state.interviewQuestion}</span>
        ) : (
          <span className="chatbot-question-empty">Generate a question to get started</span>
        )}
      </div>

      <ScrollArea className="chatbot-messages">
        {!hasMessages && (
          <div className="chatbot-empty-state">
            <MessageCircle size={32} />
            <span>Ask clarifying questions about the design problem — just like a real interview.</span>
          </div>
        )}
        {state.messages.map((msg, i) => (
          <MessageBubble key={`${msg.timestamp}-${i}`} message={msg} />
        ))}
        {state.isThinking && <TypingIndicator />}
        <div ref={scrollEndRef} />
      </ScrollArea>

      {state.error && <div className="chatbot-error">{state.error}</div>}

      <div className="chatbot-input-row">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`chatbot-mic-button ${state.isListening ? "chatbot-mic-button--listening" : ""} ${state.isTranscribing ? "chatbot-mic-button--transcribing" : ""}`}
          aria-label={state.isListening ? "Stop listening" : state.isTranscribing ? "Transcribing..." : "Start voice input"}
          onClick={state.isListening ? onStopListening : onStartListening}
          disabled={state.isTranscribing}
        >
          {state.isListening ? <Square size={14} /> : state.isTranscribing ? <Loader2 size={16} className="chatbot-spinner" /> : <Mic size={16} />}
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a question..."
          className="chatbot-text-input"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="chatbot-send-button"
          aria-label="Send"
          disabled={!input.trim()}
          onClick={handleSend}
        >
          <SendHorizontal size={16} />
        </Button>
      </div>
    </div>
  );
}
