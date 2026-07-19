export type AudioChunk = {
  blob: Blob;
  startMs: number;
  endMs: number;
};

const SILENCE_THRESHOLD = 0.015;
const SILENCE_DURATION_MS = 600;
const MIN_CHUNK_MS = 30_000;
const MAX_CHUNK_MS = 60_000;
const CHECK_INTERVAL_MS = 100;

export class AudioRecorder {
  private mediaRecorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private stream?: MediaStream;
  private recordingStartMs = 0;
  private currentChunkBlobs: Blob[] = [];
  private currentChunkStartMs = 0;
  private chunksMeta: AudioChunk[] = [];
  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private silenceStartMs = 0;
  private inSilence = false;
  private checkTimer?: ReturnType<typeof setInterval>;

  get isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);

    const mimeType =
      getSupportedMimeType("audio/webm;codecs=opus") ??
      getSupportedMimeType("audio/webm") ??
      getSupportedMimeType("audio/ogg;codecs=opus");

    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);

    this.recordingStartMs = Date.now();
    this.currentChunkStartMs = 0;
    this.currentChunkBlobs = [];
    this.chunksMeta = [];
    this.silenceStartMs = 0;
    this.inSilence = false;

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
        this.currentChunkBlobs.push(event.data);
      }
    };

    this.checkTimer = setInterval(() => this.checkSilence(), CHECK_INTERVAL_MS);
    this.mediaRecorder.start(200);
  }

  private checkSilence(): void {
    if (!this.analyser) return;

    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / data.length);

    const elapsed = Date.now() - this.recordingStartMs;
    const chunkDuration = elapsed - this.currentChunkStartMs;

    if (rms < SILENCE_THRESHOLD) {
      if (!this.inSilence) {
        this.inSilence = true;
        this.silenceStartMs = elapsed;
      } else if (
        elapsed - this.silenceStartMs >= SILENCE_DURATION_MS &&
        chunkDuration >= MIN_CHUNK_MS
      ) {
        this.flushCurrentChunk(elapsed);
        this.inSilence = false;
      }
    } else {
      this.inSilence = false;
    }

    if (chunkDuration >= MAX_CHUNK_MS) {
      this.flushCurrentChunk(elapsed);
    }
  }

  private flushCurrentChunk(endMs: number): void {
    if (this.currentChunkBlobs.length === 0) return;
    this.chunksMeta.push({
      blob: new Blob(this.currentChunkBlobs, { type: this.mediaRecorder!.mimeType }),
      startMs: this.currentChunkStartMs,
      endMs,
    });
    this.currentChunkBlobs = [];
    this.currentChunkStartMs = endMs;
  }

  stop(): Promise<{ blob: Blob; chunks: AudioChunk[] }> {
    return new Promise((resolve) => {
      const recorder = this.mediaRecorder;
      if (this.checkTimer) clearInterval(this.checkTimer);

      if (!recorder || recorder.state === "inactive") {
        const blob = new Blob(this.chunks, { type: recorder?.mimeType });
        const chunks = this.flushChunks(blob);
        this.chunks = [];
        this.audioContext?.close();
        resolve({ blob, chunks });
        return;
      }

      recorder.addEventListener("stop", () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType });
        const chunks = this.flushChunks(blob);
        this.chunks = [];
        this.audioContext?.close();
        resolve({ blob, chunks });
      }, { once: true });

      recorder.stop();
      this.stream?.getTracks().forEach((track) => track.stop());
    });
  }

  private flushChunks(fullBlob: Blob): AudioChunk[] {
    const elapsed = Date.now() - this.recordingStartMs;
    this.flushCurrentChunk(elapsed);
    if (this.chunksMeta.length <= 1) {
      return [{ blob: fullBlob, startMs: 0, endMs: elapsed }];
    }
    return this.chunksMeta;
  }

  discard(): void {
    if (this.checkTimer) clearInterval(this.checkTimer);
    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.stop();
    }

    this.stream?.getTracks().forEach((track) => track.stop());
    this.audioContext?.close();
    this.chunks = [];
    this.currentChunkBlobs = [];
    this.chunksMeta = [];
    this.recordingStartMs = 0;
    this.silenceStartMs = 0;
    this.inSilence = false;
    this.audioContext = undefined;
    this.stream = undefined;
  }
}

function getSupportedMimeType(mimeType: string): string | undefined {
  return MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined;
}
