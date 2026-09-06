import { expect, test } from "bun:test";
import { BANDS, BIN_WIDTH, SAMPLE_RATE } from "./constants";
import { extractPeaks } from "./peaks";
import { spectrogram } from "./spectrogram";

function tones(bins: number[], n: number): Float32Array {
  const x = new Float32Array(n);
  for (const bin of bins) {
    for (let i = 0; i < n; i++) x[i] += Math.sin((2 * Math.PI * bin * BIN_WIDTH * i) / SAMPLE_RATE);
  }
  return x;
}

test("finds the two tones it was given", () => {
  const peaks = extractPeaks(spectrogram(tones([41, 93], SAMPLE_RATE)));
  const bins = new Set(peaks.map((p) => p.bin));

  expect(bins.has(41)).toBe(true);
  expect(bins.has(93)).toBe(true);
});

test("emits peaks in frame order", () => {
  const peaks = extractPeaks(spectrogram(tones([41, 93, 300], SAMPLE_RATE)));

  expect(peaks.length).toBeGreaterThan(0);
  for (let i = 1; i < peaks.length; i++) expect(peaks[i]!.frame).toBeGreaterThanOrEqual(peaks[i - 1]!.frame);
});

test("keeps at most one peak per band per frame", () => {
  const peaks = extractPeaks(spectrogram(tones([41, 93, 300], SAMPLE_RATE)));
  const perFrame = new Map<number, number>();
  for (const p of peaks) perFrame.set(p.frame, (perFrame.get(p.frame) ?? 0) + 1);

  for (const count of perFrame.values()) expect(count).toBeLessThanOrEqual(BANDS.length);
});

test("discards bands quieter than the frame average", () => {
  const peaks = extractPeaks(spectrogram(tones([93], SAMPLE_RATE)));
  const perFrame = new Map<number, number>();
  for (const p of peaks) perFrame.set(p.frame, (perFrame.get(p.frame) ?? 0) + 1);

  for (const count of perFrame.values()) expect(count).toBeLessThan(BANDS.length);
});
