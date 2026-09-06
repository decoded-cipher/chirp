import { expect, test } from "bun:test";
import { BIN_WIDTH, SAMPLE_RATE, WINDOW_SIZE } from "./constants";
import { fft } from "./fft";

function magnitudes(signal: Float32Array): Float32Array {
  const re = Float32Array.from(signal);
  const im = new Float32Array(signal.length);
  fft(re, im);

  const bins = signal.length / 2 + 1;
  const out = new Float32Array(bins);
  for (let i = 0; i < bins; i++) out[i] = Math.hypot(re[i]!, im[i]!);
  return out;
}

function sine(hz: number, n = WINDOW_SIZE): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE);
  return x;
}

function argmax(a: Float32Array): number {
  let best = 0;
  for (let i = 1; i < a.length; i++) if (a[i]! > a[best]!) best = i;
  return best;
}

test("puts an exact-bin sine in that bin and nowhere else", () => {
  const mag = magnitudes(sine(93 * BIN_WIDTH));

  expect(argmax(mag)).toBe(93);
  expect(mag[92]! / mag[93]!).toBeLessThan(0.01);
  expect(mag[94]! / mag[93]!).toBeLessThan(0.01);
});

test("puts a 1 kHz sine in bin 93", () => {
  expect(argmax(magnitudes(sine(1000)))).toBe(93);
});

test("resolves two tones independently", () => {
  const a = sine(41 * BIN_WIDTH);
  const b = sine(93 * BIN_WIDTH);
  const mixed = new Float32Array(WINDOW_SIZE);
  for (let i = 0; i < WINDOW_SIZE; i++) mixed[i] = a[i]! + b[i]!;

  const mag = magnitudes(mixed);
  const peak = Math.max(mag[41]!, mag[93]!);
  for (let i = 0; i < mag.length; i++) {
    if (i !== 41 && i !== 93) expect(mag[i]! / peak).toBeLessThan(0.01);
  }
});

test("puts constant input entirely in bin 0", () => {
  const mag = magnitudes(new Float32Array(WINDOW_SIZE).fill(1));

  expect(mag[0]).toBeCloseTo(WINDOW_SIZE, 1);
  expect(argmax(mag)).toBe(0);
});

test("spreads an impulse flat across the spectrum", () => {
  const x = new Float32Array(WINDOW_SIZE);
  x[0] = 1;

  for (const m of magnitudes(x)) expect(m).toBeCloseTo(1, 5);
});

test("rejects lengths that are not a power of two", () => {
  expect(() => fft(new Float32Array(1000), new Float32Array(1000))).toThrow(/power of two/);
});

test("rejects mismatched component lengths", () => {
  expect(() => fft(new Float32Array(8), new Float32Array(4))).toThrow(/same length/);
});
