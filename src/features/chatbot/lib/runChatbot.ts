import { chatCompletion } from "../../../shared/lib/ai/chatCompletion";
import type { ChatbotMessage } from "../../../entities/chatbot";
import { buildChatbotMessages, buildChatbotSystemPrompt } from "../api/buildChatbotPrompt";

export async function askChatbot(
  apiKey: string,
  model: string,
  interviewQuestion: string,
  history: ChatbotMessage[],
  question: string,
): Promise<string> {
  const systemPrompt = buildChatbotSystemPrompt(interviewQuestion);
  const messages = buildChatbotMessages(systemPrompt, history, question);
  return chatCompletion(apiKey, model, messages, {
    temperature: 0.6,
    maxTokens: 200,
  });
}
