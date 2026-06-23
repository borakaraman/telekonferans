/** Root-mean-square energy of 16-bit PCM samples, normalized to 0–1. */
export function frameRms(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const n = samples[i] / 32768;
    sum += n * n;
  }
  return Math.sqrt(sum / samples.length);
}

export type VadAction =
  | { type: "drop" }
  | { type: "begin"; prelude: Int16Array[] }
  | { type: "relay" }
  | { type: "finish" };

export interface SpeechVadOptions {
  /** RMS above which a frame counts as speech (0–1). */
  speechThreshold?: number;
  /** Consecutive silent frames before end-of-speech (100 ms frames → 5 ≈ 500 ms). */
  silentFramesToEnd?: number;
  /** Ring buffer of pre-speech frames sent after activityStart. */
  maxPreSpeechFrames?: number;
}

/**
 * Client-side voice activity gate. Returns what to do with each incoming frame
 * so silent audio is never forwarded to Gemini.
 */
export class SpeechVad {
  private speaking = false;
  private silentStreak = 0;
  private preSpeechBuffer: Int16Array[] = [];

  private readonly speechThreshold: number;
  private readonly silentFramesToEnd: number;
  private readonly maxPreSpeechFrames: number;

  constructor(options: SpeechVadOptions = {}) {
    this.speechThreshold = options.speechThreshold ?? 0.02;
    this.silentFramesToEnd = options.silentFramesToEnd ?? 5;
    this.maxPreSpeechFrames = options.maxPreSpeechFrames ?? 3;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  reset(): void {
    this.speaking = false;
    this.silentStreak = 0;
    this.preSpeechBuffer = [];
  }

  process(samples: Int16Array): VadAction {
    const isSpeech = frameRms(samples) > this.speechThreshold;

    if (!this.speaking) {
      this.preSpeechBuffer.push(new Int16Array(samples));
      if (this.preSpeechBuffer.length > this.maxPreSpeechFrames) {
        this.preSpeechBuffer.shift();
      }
      if (!isSpeech) {
        return { type: "drop" };
      }

      this.speaking = true;
      this.silentStreak = 0;
      const prelude = this.preSpeechBuffer.slice(0, -1);
      this.preSpeechBuffer = [];
      return { type: "begin", prelude };
    }

    if (isSpeech) {
      this.silentStreak = 0;
      return { type: "relay" };
    }

    this.silentStreak++;
    if (this.silentStreak >= this.silentFramesToEnd) {
      this.speaking = false;
      this.silentStreak = 0;
      return { type: "finish" };
    }

    // Trailing silence while still inside the speech window.
    return { type: "relay" };
  }
}
