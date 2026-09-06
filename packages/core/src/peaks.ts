import { BANDS, THRESHOLD_COEFF, THRESHOLD_DECAY } from "./constants";
import type { Spectrogram } from "./spectrogram";

export interface Peak {
  frame: number;
  bin: number;
}

export interface PeakOptions {
  bands?: readonly (readonly [number, number])[];
  thresholdCoeff?: number;
  decay?: number;
}

export function extractPeaks(spec: Spectrogram, options: PeakOptions = {}): Peak[] {
  const bands = options.bands ?? BANDS;
  const coeff = options.thresholdCoeff ?? THRESHOLD_COEFF;
  const decay = options.decay ?? THRESHOLD_DECAY;

  const peaks: Peak[] = [];
  const bins = new Int32Array(bands.length);
  const magnitudes = new Float64Array(bands.length);
  const history = new Float64Array(bands.length);

  for (let f = 0; f < spec.frames; f++) {
    const base = f * spec.bins;
    let sum = 0;

    for (let b = 0; b < bands.length; b++) {
      const [lo, hi] = bands[b]!;
      let bestBin = lo;
      let bestPower = -1;
      for (let k = lo; k < hi && k < spec.bins; k++) {
        const p = spec.power[base + k]!;
        if (p > bestPower) {
          bestPower = p;
          bestBin = k;
        }
      }
      bins[b] = bestBin;
      // A mean of squares is dominated by its largest term, so average magnitudes.
      magnitudes[b] = Math.sqrt(bestPower);
      sum += magnitudes[b]!;
    }

    const frameThreshold = (sum / bands.length) * coeff;
    for (let b = 0; b < bands.length; b++) {
      const magnitude = magnitudes[b]!;
      const threshold = decay > 0 ? Math.max(frameThreshold, history[b]! * coeff) : frameThreshold;
      if (magnitude >= threshold) peaks.push({ frame: f, bin: bins[b]! });
      history[b] = decay > 0 ? history[b]! * decay + magnitude * (1 - decay) : 0;
    }
  }

  return peaks;
}
