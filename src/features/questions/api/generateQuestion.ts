import { chatCompletion } from "../../../shared/lib/ai/chatCompletion";

export const domains = [
  "Messaging & Social",
  "Media & Streaming",
  "Commerce & Payments",
  "Transportation & Logistics",
  "Productivity & Collaboration",
  "Search & Discovery",
  "Data & Analytics",
  "AI & ML",
  "Cloud & Infrastructure",
  "Communication",
  "Booking & Scheduling",
  "Industry",
  "Emerging Tech",
  "Security",
];

function pickDomain(): string | null {
  const freeChoiceWeight = 5;
  const totalWeight = domains.length + freeChoiceWeight;
  const random = Math.random() * totalWeight;
  
  if (random >= domains.length) return null;
  return domains[Math.floor(random)];
}

export type GenerateQuestionOptions = {
  domain?: string | null;
  context?: string;
};

export async function generateQuestion(
  apiKey: string,
  model: string,
  options?: GenerateQuestionOptions,
): Promise<{ title: string; full: string }> {
  const selectedDomain = options?.domain != null ? options.domain : pickDomain();

  const contextBlock = options?.context
    ? `\n\nAdditional user context/hint: "${options.context}"\nIncorporate this into the question where relevant.`
    : "";

  const response = await chatCompletion(
    apiKey,
    model,
    [
      {
        role: "system",
        content: `You are a senior system design interviewer. Generate a single high-level design (HLD) interview question.

${selectedDomain ? `Domain: ${selectedDomain}` : "Domain: You choose freely (any domain not in the standard list)."}${contextBlock}

Respond in this exact JSON format:
{"title": "short 3-5 word title", "full": "the full question text"}

Rules for title:
- Must be 3-5 words max
- Should capture the essence of the question
- Examples: "Design WhatsApp", "URL Shortener Service", "Video Streaming Platform", "Ride Sharing App"

Rules for full question:
- Must be realistic and commonly asked in HLD interviews at top tech companies.
- Keep it vague and open-ended, just like a real interview.
- Phrase as "Design a [system] similar to [one product] that [core function/action] while ensuring it [key requirement]." — direct and concrete.
- The key requiremnt should be a very high level requirement and it can be skipped if not needed.
- Do NOT conflate fundamentally different platforms (e.g. Instagram and Twitter have very different feed models — pick one).
- ${selectedDomain ? `Focus ONLY on the "${selectedDomain}" domain.` : "Pick any interesting domain."}

${selectedDomain ? `Avoid: Google Docs, URL Shortener, Chat systems.` : ""}

Respond with ONLY the JSON object. No preamble, no explanation.`,
      },
      {
        role: "user",
        content: "Generate a new HLD interview question.",
      },
    ],
    { temperature: 1.0 },
  );

  return JSON.parse(response.trim());
}
