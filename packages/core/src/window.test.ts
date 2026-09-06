import { expect, test } from "bun:test";
import { hannWindow } from "./window";

test("starts and ends at zero", () => {
  const w = hannWindow(1024);
  expect(w[0]).toBeCloseTo(0, 10);
  expect(w[1023]).toBeCloseTo(0, 10);
});

test("peaks at one in the middle", () => {
  const w = hannWindow(1025);
  expect(w[512]).toBeCloseTo(1, 10);
});

test("is symmetric", () => {
  const w = hannWindow(1024);
  for (let i = 0; i < 512; i++) {
    expect(w[i]).toBeCloseTo(w[1023 - i]!, 6);
  }
});

test("returns the cached instance for a repeated size", () => {
  expect(hannWindow(256)).toBe(hannWindow(256));
});
