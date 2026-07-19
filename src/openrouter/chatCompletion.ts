const BASE_URL = "https://openrouter.ai/api/v1";

type OpenRouterHeaders = {
  Authorization: string;
  "Content-Type": string;
  "HTTP-Referer": string;
  "X-Title": string;
};

function makeHeaders(apiKey: string): OpenRouterHeaders {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://excalidraw-recorder.local",
    "X-Title": "Excalidraw Recorder",
  };
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function chatCompletion(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: makeHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages,
        ...(options?.temperature != null && { temperature: options.temperature }),
        ...(options?.maxTokens != null && { max_tokens: options.maxTokens }),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Chat completion timed out after 2 minutes");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Chat completion failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
