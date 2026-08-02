import { AudioRecorder } from "../../../shared/lib/audio/AudioRecorder";
import { transcribeAudio } from "../../../shared/lib/gemini";
import { GeminiLiveClient } from "../../../shared/lib/ai/GeminiLiveClient";
import { PcmCapture } from "../../../shared/lib/audio/pcmCapture";

export class VoiceInput {
  private audioRecorder: AudioRecorder;
  private apiKey: string;
  private model: string;
  private apiMode: "rest" | "live";
  private liveClient: GeminiLiveClient | null = null;
  private pcmCapture: PcmCapture | null = null;
  private liveTranscript = "";
  private onPartialTranscript: ((text: string) => void) | null = null;
  private finishLive: (() => void) | null = null;
  private liveDebounce: ReturnType<typeof setTimeout> | null = null;
  private activeMode: "rest" | "live" = "rest";
  private audioBuffer: string[] = [];
  private static readonly MAX_BUFFER_CHUNKS = 160; // ~5 seconds at 16kHz mono

  constructor(apiKey: string, audioModel: string) {
    this.audioRecorder = new AudioRecorder();
    this.apiKey = apiKey;
    this.model = audioModel;
    this.apiMode = "live";
  }

  setOnPartialTranscript(callback: (text: string) => void): void {
    this.onPartialTranscript = callback;
  }

  updateModel(audioModel: string): void {
    this.model = audioModel;
    this.apiMode = "live";
  }

  async startListening(): Promise<void> {
    if (this.apiMode === "live") {
      try {
        await this.startLive();
        this.activeMode = "live";
        return;
      } catch {
        this.apiMode = "rest";
      }
    }
    this.activeMode = "rest";
    return this.audioRecorder.start();
  }

  async stopAndTranscribe(): Promise<string> {
    if (this.activeMode === "live") {
      return this.stopLive();
    }
    const { blob } = await this.audioRecorder.stop();
    if (blob.size === 0) {
      return "";
    }
    const segments = await transcribeAudio(this.apiKey, this.model, blob);
    return segments.map((s) => s.text).join(" ");
  }

  private startLive(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.liveTranscript = "";
      this.audioBuffer = [];
      let settled = false;

      // Start capturing audio immediately — buffer chunks until WebSocket is ready
      this.pcmCapture = new PcmCapture();
      this.pcmCapture.start((base64) => {
        if (this.liveClient) {
          this.liveClient.sendAudio(base64);
        } else {
          if (this.audioBuffer.length < VoiceInput.MAX_BUFFER_CHUNKS) {
            this.audioBuffer.push(base64);
          }
        }
      }).catch((err) => {
        if (!settled) {
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });

      this.liveClient = new GeminiLiveClient(this.apiKey, this.model, {
        onSetupComplete: () => {
          if (settled) return;
          // Flush buffered audio chunks
          for (const chunk of this.audioBuffer) {
            this.liveClient?.sendAudio(chunk);
          }
          this.audioBuffer = [];
          settled = true;
          resolve();
        },
        onInputTranscript: (text) => {
          this.liveTranscript += text;
          if (this.liveDebounce) {
            clearTimeout(this.liveDebounce);
            this.liveDebounce = setTimeout(() => this.finishLive?.(), 1500);
          }
          this.onPartialTranscript?.(this.liveTranscript);
        },
        onTurnComplete: () => {
          if (!this.liveDebounce) {
            this.liveDebounce = setTimeout(() => this.finishLive?.(), 1500);
          }
        },
        onError: (error) => {
          if (!settled) {
            settled = true;
            this.pcmCapture?.stop();
            this.pcmCapture = null;
            reject(new Error(error));
          }
        },
        onClose: () => {
          this.liveClient = null;
        },
      });

      this.liveClient.connect();
    });
  }

  private stopLive(): Promise<string> {
    return new Promise((resolve) => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        const transcript = this.liveTranscript.trim();
        this.finishLive = null;
        if (this.liveDebounce) {
          clearTimeout(this.liveDebounce);
          this.liveDebounce = null;
        }
        this.pcmCapture?.stop();
        this.pcmCapture = null;
        setTimeout(() => {
          this.liveClient?.disconnect();
          this.liveClient = null;
        }, 500);
        resolve(transcript);
      };

      this.finishLive = finish;
      this.liveClient?.sendTurnComplete();

      setTimeout(finish, 5000);
    });
  }
}
