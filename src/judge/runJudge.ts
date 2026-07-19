import { chatCompletion } from "../openrouter/chatCompletion";
import type { RecordingSession } from "../recorder/types";
import { buildJudgePrompt } from "./buildJudgePrompt";
import type { JudgeReport } from "./types";

export type JudgeStatus =
  | { state: "idle" }
  | { state: "running"; sessionId: string }
  | { state: "done"; sessionId: string; report: JudgeReport }
  | { state: "error"; sessionId: string; error: string };

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return text.trim();
}

function validateReport(raw: Record<string, unknown>): raw is Omit<JudgeReport, "sessionId" | "model" | "judgedAt"> {
  return (
    Array.isArray(raw.dimensions) &&
    typeof raw.overallScore === "number" &&
    typeof raw.summary === "string"
  );
}

export async function runJudge(
  apiKey: string,
  model: string,
  session: RecordingSession,
  onStatusChange: (status: JudgeStatus) => void,
): Promise<JudgeReport> {
  const { sessionId } = session;
  onStatusChange({ state: "running", sessionId });

  try {
    const messages = buildJudgePrompt(session);
    const response = await chatCompletion(apiKey, model, messages, { temperature: 0.3 });

    const jsonText = extractJson(response);
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;

    if (!validateReport(parsed)) {
      throw new Error("Invalid judge response: missing required fields (dimensions, overallScore, summary)");
    }

    const report: JudgeReport = {
      sessionId,
      model,
      judgedAt: new Date().toISOString(),
      dimensions: parsed.dimensions,
      overallScore: parsed.overallScore,
      strengths: parsed.strengths as string[],
      improvements: parsed.improvements as string[],
      summary: parsed.summary,
    };

    onStatusChange({ state: "done", sessionId, report });
    return report;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    onStatusChange({ state: "error", sessionId, error });
    throw err;
  }
}
