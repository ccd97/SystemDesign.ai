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
  private liveFinalTranscript = "";
  private onPartialTranscript: ((text: string) => void) | null = null;
  private turnCompleteResolve: (() => void) | null = null;
  private activeMode: "rest" | "live" = "rest";

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
      this.liveFinalTranscript = "";

      this.liveClient = new GeminiLiveClient(this.apiKey, this.model, {
        onSetupComplete: () => {
          this.pcmCapture = new PcmCapture();
          this.pcmCapture.start((base64) => {
            this.liveClient?.sendAudio(base64);
          }).then(() => {
            resolve();
          }).catch((err) => {
            reject(err instanceof Error ? err : new Error(String(err)));
          });
        },
        onTranscript: (_text, isFinal) => {
          if (isFinal) {
            this.liveFinalTranscript += _text;
            this.liveTranscript = "";
          } else {
            this.liveTranscript = _text;
          }
          this.onPartialTranscript?.(this.liveFinalTranscript + this.liveTranscript);
        },
        onTurnComplete: () => {
          this.turnCompleteResolve?.();
          this.turnCompleteResolve = null;
        },
        onError: (error) => {
          reject(new Error(error));
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
      this.pcmCapture?.stop();
      this.pcmCapture = null;

      const waitAndClose = () => {
        setTimeout(() => {
          this.liveClient?.disconnect();
          this.liveClient = null;
          resolve((this.liveFinalTranscript + this.liveTranscript).trim());
        }, 2000);
      };

      this.turnCompleteResolve = waitAndClose;
      this.liveClient?.sendTurnComplete();
    });
  }
}
