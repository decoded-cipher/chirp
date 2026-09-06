import { expect, test } from "bun:test";
import { FAN_OUT, FREQ_FUZZ, TARGET_ZONE_MAX, TARGET_ZONE_MIN } from "./constants";
import { fingerprint, packHash, unpackHash } from "./hash";
import type { Peak } from "./peaks";

test("round-trips every packable combination", () => {
  for (let anchor = 0; anchor < 512; anchor += 7) {
    for (let target = 0; target < 512; target += 11) {
      for (let dt = TARGET_ZONE_MIN; dt <= TARGET_ZONE_MAX; dt += 5) {
        const parts = unpackHash(packHash(anchor, target, dt));
        expect(parts.anchor).toBe(anchor >> FREQ_FUZZ);
        expect(parts.target).toBe(target >> FREQ_FUZZ);
        expect(parts.dt).toBe(dt);
      }
    }
  }
});

test("never produces a negative hash", () => {
  for (let bin = 0; bin < 512; bin++) {
    expect(packHash(bin, 511, TARGET_ZONE_MAX)).toBeGreaterThanOrEqual(0);
  }
  expect(packHash(511, 511, TARGET_ZONE_MAX)).toBeLessThan(2 ** 24);
});

test("keeps fields separate at every fuzz level", () => {
  for (const fuzz of [0, 1, 2]) {
    const parts = unpackHash(packHash(511, 383, TARGET_ZONE_MAX, fuzz));
    expect(parts.anchor).toBe(511 >> fuzz);
    expect(parts.target).toBe(383 >> fuzz);
    expect(parts.dt).toBe(TARGET_ZONE_MAX);
  }
});

test("pairs each anchor with at most FAN_OUT targets", () => {
  const peaks: Peak[] = Array.from({ length: 20 }, (_, i) => ({ frame: i, bin: 100 + i }));
  const perAnchor = new Map<number, number>();
  for (const f of fingerprint(peaks)) perAnchor.set(f.frame, (perAnchor.get(f.frame) ?? 0) + 1);

  for (const count of perAnchor.values()) expect(count).toBeLessThanOrEqual(FAN_OUT);
});

test("ignores targets outside the zone", () => {
  const peaks: Peak[] = [
    { frame: 0, bin: 100 },
    { frame: 0, bin: 200 },
    { frame: TARGET_ZONE_MAX + 1, bin: 300 },
  ];

  expect(fingerprint(peaks)).toEqual([]);
});

test("anchors the hash at the anchor frame", () => {
  const peaks: Peak[] = [
    { frame: 5, bin: 100 },
    { frame: 9, bin: 200 },
  ];
  const [fp] = fingerprint(peaks);

  expect(fp!.frame).toBe(5);
  expect(unpackHash(fp!.hash).dt).toBe(4);
});
