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
- Speech events: what the candidate said.

Evaluate the candidate on these 8 dimensions:

1. Requirements & Scope — Did they identify functional and non-functional requirements? Did they proactively scope out what is NOT being built? Did they clarify ambiguity before diving in?
2. Problem Navigation — How did they flow through the design? Did they identify the hardest part (the crux) early? Was their ordering of decisions logical?
3. High-Level Architecture — Is the overall structure sound? Are major components identified with clear responsibilities? Does the data flow make sense end-to-end?
4. Tradeoffs & Reasoning — Did they consider alternatives? Did they explain pros/cons and justify their choices with clear reasoning?
5. Deep Dives — Did they go deep on the critical-path components? Did they demonstrate technical depth where it mattered most?
6. Scalability — Did they address how the system grows? Caching, load balancing, partitioning, CDN usage, etc.
7. Data & API Design — Is the data model appropriate? Are API contracts well-defined? Did they consider failure modes?
8. Communication — Did they articulate their thinking clearly for a future viewer? Did they explain their reasoning out loud as they drew, or did they go silent? Did they use analogies or simple language to make complex ideas accessible?

For each dimension, provide:
- A score from 1 to 5
- Observations — each one captures a specific moment from the recording and explains its impact on this dimension

Be evidence-based. Quote the candidate's actual actions. When something is missing, note that "at no point did the candidate address X" rather than assuming they thought about it.

Then give:
- Overall score (1-5)
- Strengths — list all notable strengths with specific evidence
- Improvements — list all areas for improvement with concrete examples of what to say/do instead
Be constructive. Frame improvements as "next time, try X" rather than just listing failures.

Respond in valid JSON matching this schema:
{
  "dimensions": [
    { "name": string, "score": number, "observations": [string, string, ...] }
  ],
  "overallScore": number,
  "strengths": [string, string, ...],
  "improvements": [string, string, ...]
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
