import type { ChatMessage } from "../openrouter/chatCompletion";
import type { RecordingSession } from "../recorder/types";

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function buildEventTimeline(session: RecordingSession): string {
  const events = session.events;
  const maxEvents = 200;
  const keep = 50;

  if (events.length <= maxEvents) {
    return events
      .map((e) => {
        const elapsed = e.elapsedMs != null ? formatElapsed(e.elapsedMs) : "??:??";
        return `${String(e.seq).padStart(4)}  ${elapsed}  ${e.action.padEnd(20)} ${e.summary}`;
      })
      .join("\n");
  }

  const first = events.slice(0, keep);
  const middle = events.slice(keep, events.length - keep);
  const last = events.slice(events.length - keep);

  const lines: string[] = [];
  for (const e of first) {
    const elapsed = e.elapsedMs != null ? formatElapsed(e.elapsedMs) : "??:??";
    lines.push(`${String(e.seq).padStart(4)}  ${elapsed}  ${e.action.padEnd(20)} ${e.summary}`);
  }
  lines.push(`  ... (${middle.length} events omitted — summarized below) ...`);
  lines.push(
    `  Middle summary: ${middle.filter((e) => e.action === "speech").length} speech events, ${middle.filter((e) => e.action !== "speech").length} drawing events`,
  );
  for (const e of last) {
    const elapsed = e.elapsedMs != null ? formatElapsed(e.elapsedMs) : "??:??";
    lines.push(`${String(e.seq).padStart(4)}  ${elapsed}  ${e.action.padEnd(20)} ${e.summary}`);
  }

  return lines.join("\n");
}

function buildFinalSceneSummary(session: RecordingSession): string {
  const elements = session.finalScene.elements as Record<string, unknown>[];
  if (!elements || elements.length === 0) return "(no elements)";

  const byType: Record<string, number> = {};
  const textContents: string[] = [];

  for (const el of elements) {
    const type = (el.type as string) || "unknown";
    byType[type] = (byType[type] || 0) + 1;

    if (type === "text" && el.text) {
      const text = String(el.text).slice(0, 80);
      const x = Math.round(el.x as number);
      const y = Math.round(el.y as number);
      textContents.push(`  - "${text}" at (${x}, ${y})`);
    }
  }

  const typeSummary = Object.entries(byType)
    .map(([t, c]) => `${c} ${t}`)
    .join(", ");

  const lines = [`Elements (${elements.length} total): ${typeSummary}`];
  if (textContents.length > 0) {
    lines.push("Text elements:");
    lines.push(...textContents);
  }

  return lines.join("\n");
}

export function buildJudgePrompt(session: RecordingSession): ChatMessage[] {
  const durationMin = Math.floor(session.durationMs / 60000);
  const durationSec = Math.floor((session.durationMs % 60000) / 1000);
  const durationStr = `${durationMin}m ${durationSec}s`;

  const systemMessage = `You are a senior system design interviewer evaluating a candidate's high-level design (HLD) interview performance.

You are given a recording of the candidate's drawing and verbal explanations on an Excalidraw canvas.

The recording contains two types of events:
- Drawing events: element creation, movement, resizing, text editing, etc.
- Speech events: what the candidate said (transcribed from audio).

Evaluate the candidate on these dimensions:
1. Problem Understanding — Did they clarify requirements and constraints?
2. High-Level Architecture — Is the overall design sound? Are major components identified?
3. Component Design — Are individual components well thought out?
4. Data Model — Is the data model appropriate for the problem?
5. Scalability — Did they address scaling, caching, load balancing, etc.?
6. Communication — Did they explain their thinking clearly? Did they structure their approach?
7. Diagram Quality — Is the Excalidraw diagram organized, readable, and complete?

For each dimension, give:
- A score from 1 to 5
- Specific observations (what was good, what was missing)

Then give:
- Overall score (1-5)
- Top 3 strengths
- Top 3 areas for improvement
- A brief overall summary (2-3 sentences)

Be specific. Reference actual events and speech from the recording. Be constructive, not harsh.

Respond in valid JSON matching this schema:
{
  "dimensions": [
    { "name": string, "score": number, "observations": string }
  ],
  "overallScore": number,
  "strengths": [string, string, string],
  "improvements": [string, string, string],
  "summary": string
}`;

  const userMessage = `## Session: ${session.canvasName || "Untitled"}

- Duration: ${durationStr}
- Total events: ${session.eventCount}
- Started: ${session.startedAt}
- Ended: ${session.endedAt}

## Event Timeline

${buildEventTimeline(session)}

## Final Scene

${buildFinalSceneSummary(session)}

Based on the above, provide your evaluation in the required JSON format.`;

  return [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ];
}
