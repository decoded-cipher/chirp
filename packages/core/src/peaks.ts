import { BANDS, THRESHOLD_COEFF } from "./constants";
import type { Spectrogram } from "./spectrogram";

export interface Peak {
  frame: number;
  bin: number;
}

/**
 * Peaks come out in frame order, which the target-zone pairing in `fingerprint`
 * relies on to stop scanning early.
 */
export function extractPeaks(spec: Spectrogram): Peak[] {
  const peaks: Peak[] = [];
  const bins = new Int32Array(BANDS.length);
  const magnitudes = new Float64Array(BANDS.length);

  for (let f = 0; f < spec.frames; f++) {
    const base = f * spec.bins;
    let sum = 0;

    for (let b = 0; b < BANDS.length; b++) {
      const [lo, hi] = BANDS[b]!;
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
      // The threshold averages magnitudes, not powers: a mean of squares is
      // dominated by its largest term and would suppress the other five bands.
      magnitudes[b] = Math.sqrt(bestPower);
      sum += magnitudes[b]!;
    }

    const threshold = (sum / BANDS.length) * THRESHOLD_COEFF;
    for (let b = 0; b < BANDS.length; b++) {
      if (magnitudes[b]! >= threshold) peaks.push({ frame: f, bin: bins[b]! });
    }
  }

  return peaks;
}
