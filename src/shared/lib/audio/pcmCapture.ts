import { arrayBufferToBase64 } from "../../utils/utils";

const TARGET_SAMPLE_RATE = 16000;

const WORKLET_CODE = `
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      this.port.postMessage({ audio: input[0] });
    }
    return true;
  }
}
registerProcessor("pcm-processor", PcmProcessor);
`;

export class PcmCapture {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private onChunk: ((base64: string) => void) | null = null;

  async start(onChunk: (base64: string) => void): Promise<void> {
    this.onChunk = onChunk;
    this.audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    await this.audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: TARGET_SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-processor");
    this.workletNode.port.onmessage = (event) => {
      const channelData = event.data.audio as Float32Array;
      const resampled = this.resample(channelData, this.audioContext!.sampleRate, TARGET_SAMPLE_RATE);
      const pcm16 = floatTo16BitPCM(resampled);
      const base64 = arrayBufferToBase64(pcm16.buffer as ArrayBuffer);
      this.onChunk?.(base64);
    };
    this.source.connect(this.workletNode);
  }

  stop(): void {
    this.workletNode?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.audioContext?.close();
    this.audioContext = null;
    this.stream = null;
    this.source = null;
    this.workletNode = null;
    this.onChunk = null;
  }

  private resample(
    input: Float32Array,
    inputRate: number,
    outputRate: number,
  ): Float32Array {
    if (inputRate === outputRate) return input;
    const ratio = inputRate / outputRate;
    const newLength = Math.round(input.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const low = Math.floor(srcIndex);
      const high = Math.min(low + 1, input.length - 1);
      const frac = srcIndex - low;
      result[i] = input[low] * (1 - frac) + input[high] * frac;
    }
    return result;
  }
}

function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}
