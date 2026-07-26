const WS_BASE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

type GeminiLiveClientEvents = {
  onSetupComplete: () => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onTurnComplete: () => void;
  onError: (error: string) => void;
  onClose: () => void;
};

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private model: string;
  private events: GeminiLiveClientEvents;
  private setupComplete = false;

  constructor(apiKey: string, model: string, events: GeminiLiveClientEvents) {
    this.apiKey = apiKey;
    this.model = model;
    this.events = events;
  }

  connect(): void {
    this.ws = new WebSocket(`${WS_BASE}?key=${this.apiKey}`);

    this.ws.onopen = () => {
      this.sendSetup();
    };

    this.ws.onmessage = (event) => {
      void this.handleMessage(event);
    };

    this.ws.onerror = () => {
      this.events.onError("WebSocket connection error");
    };

    this.ws.onclose = () => {
      this.setupComplete = false;
      this.events.onClose();
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.setupComplete = false;
    }
  }

  sendAudio(base64PCM: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) return;
    this.ws.send(JSON.stringify({
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: base64PCM,
        },
      },
    }));
  }

  sendTurnComplete(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) return;
    this.ws.send(JSON.stringify({
      clientContent: {
        turns: [],
        turnComplete: true,
      },
    }));
  }

  private sendSetup(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      setup: {
        model: `models/${this.model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
        },
        systemInstruction: {
          parts: [{ text: "Transcribe the user's speech exactly as they say it. Output only the transcription with no additional text." }],
        },
        inputAudioTranscription: {},
      },
    }));
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    let json: string;
    if (event.data instanceof Blob) {
      json = await event.data.text();
    } else if (event.data instanceof ArrayBuffer) {
      json = new TextDecoder().decode(event.data);
    } else {
      json = event.data;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(json) as Record<string, unknown>;
    } catch {
      return;
    }

    if (data.setupComplete) {
      this.setupComplete = true;
      this.events.onSetupComplete();
      return;
    }

    if (data.error) {
      const err = data.error as { message?: string };
      this.events.onError(err.message ?? "Unknown Live API error");
      return;
    }

    const serverContent = data.serverContent as Record<string, unknown> | undefined;
    if (!serverContent) return;

    const inputTranscription = serverContent.inputTranscription as { text?: string; finished?: boolean } | undefined;
    if (inputTranscription?.text) {
      this.events.onTranscript(inputTranscription.text, inputTranscription.finished ?? false);
    }

    if (serverContent.turnComplete) {
      this.events.onTurnComplete();
    }
  }
}
