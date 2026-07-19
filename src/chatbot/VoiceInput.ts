import { AudioRecorder } from "../recorder/AudioRecorder";
import { transcribeAudio } from "../gemini/client";

export class VoiceInput {
  private audioRecorder: AudioRecorder;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, audioModel: string) {
    this.audioRecorder = new AudioRecorder();
    this.apiKey = apiKey;
    this.model = audioModel;
  }

  async startListening(): Promise<void> {
    await this.audioRecorder.start();
  }

  async stopAndTranscribe(): Promise<string> {
    const { blob } = await this.audioRecorder.stop();
    if (blob.size === 0) {
      return "";
    }
    const segments = await transcribeAudio(this.apiKey, this.model, blob);
    return segments.map((s) => s.text).join(" ");
  }

  cancelListening(): void {
    this.audioRecorder.discard();
  }
}
