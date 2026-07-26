const BASE_URL = "https://openrouter.ai/api/v1";
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

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
    "HTTP-Referer": "https://system-design-ai.local",
    "X-Title": "SystemDesign.ai",
  };
}

function isRetryable(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error instanceof TypeError) return true;
  return false;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
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
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Chat completion timed out after 2 minutes");
      }
      lastError = err;
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        await delay(INITIAL_RETRY_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) {
      const data = await response.json();
      return data.choices[0].message.content;
    }

    const errorBody = await response.text();
    lastError = new Error(`Chat completion failed: ${response.status} ${errorBody}`);

    if (attempt < MAX_RETRIES && isRetryableStatus(response.status)) {
      await delay(INITIAL_RETRY_DELAY_MS * 2 ** attempt);
      continue;
    }

    throw lastError;
  }

  throw lastError;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
