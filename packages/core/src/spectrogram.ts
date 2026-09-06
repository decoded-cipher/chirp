import { FFT_BINS, HOP_SIZE, WINDOW_SIZE } from "./constants";
import { fft } from "./fft";
import { hannWindow } from "./window";

export interface Spectrogram {
  frames: number;
  bins: number;
  /** Squared magnitudes, frame-major. */
  power: Float32Array;
}

export function frameCount(samples: number): number {
  return samples < WINDOW_SIZE ? 0 : 1 + Math.floor((samples - WINDOW_SIZE) / HOP_SIZE);
}

export function spectrogram(pcm: Float32Array): Spectrogram {
  const frames = frameCount(pcm.length);
  const power = new Float32Array(frames * FFT_BINS);
  const window = hannWindow(WINDOW_SIZE);
  const re = new Float32Array(WINDOW_SIZE);
  const im = new Float32Array(WINDOW_SIZE);

  for (let f = 0; f < frames; f++) {
    const start = f * HOP_SIZE;
    for (let i = 0; i < WINDOW_SIZE; i++) re[i] = pcm[start + i]! * window[i]!;
    im.fill(0);
    fft(re, im);

    const out = f * FFT_BINS;
    for (let b = 0; b < FFT_BINS; b++) power[out + b] = re[b]! * re[b]! + im[b]! * im[b]!;
  }

  return { frames, bins: FFT_BINS, power };
}
