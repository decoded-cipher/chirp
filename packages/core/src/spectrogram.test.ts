import { expect, test } from "bun:test";
import { BIN_WIDTH, FFT_BINS, HOP_SIZE, SAMPLE_RATE, WINDOW_SIZE } from "./constants";
import { frameCount, spectrogram } from "./spectrogram";

function sine(hz: number, n: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE);
  return x;
}

function loudestBin(spec: ReturnType<typeof spectrogram>, frame: number): number {
  const base = frame * spec.bins;
  let best = 0;
  for (let b = 1; b < spec.bins; b++) if (spec.power[base + b]! > spec.power[base + best]!) best = b;
  return best;
}

test("counts frames from the window and hop", () => {
  expect(frameCount(WINDOW_SIZE - 1)).toBe(0);
  expect(frameCount(WINDOW_SIZE)).toBe(1);
  expect(frameCount(WINDOW_SIZE + HOP_SIZE)).toBe(2);
  expect(frameCount(SAMPLE_RATE)).toBe(20);
});

test("holds a steady tone in the same bin across every frame", () => {
  const spec = spectrogram(sine(93 * BIN_WIDTH, SAMPLE_RATE));

  expect(spec.frames).toBe(20);
  expect(spec.bins).toBe(FFT_BINS);
  for (let f = 0; f < spec.frames; f++) expect(loudestBin(spec, f)).toBe(93);
});

test("tracks a tone that changes partway through", () => {
  const first = sine(41 * BIN_WIDTH, SAMPLE_RATE);
  const second = sine(200 * BIN_WIDTH, SAMPLE_RATE);
  const pcm = new Float32Array(SAMPLE_RATE * 2);
  pcm.set(first, 0);
  pcm.set(second, SAMPLE_RATE);

  const spec = spectrogram(pcm);
  expect(loudestBin(spec, 2)).toBe(41);
  expect(loudestBin(spec, spec.frames - 3)).toBe(200);
});

test("produces nothing for input shorter than one window", () => {
  const spec = spectrogram(new Float32Array(WINDOW_SIZE - 1));
  expect(spec.frames).toBe(0);
  expect(spec.power.length).toBe(0);
});
