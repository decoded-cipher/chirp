import { expect, test } from "bun:test";
import { FRAME_DURATION, MIN_VOTES, OFFSET_BUCKET } from "./constants";
import type { Fingerprint } from "./hash";
import { buildIndex, match, offsetSeconds } from "./match";

function prints(hashes: number[], startFrame: number): Fingerprint[] {
  return hashes.map((hash, i) => ({ hash, frame: startFrame + i }));
}

const HASHES = Array.from({ length: 20 }, (_, i) => 100 + i);

test("recovers the song and its offset", () => {
  const index = buildIndex([[1, prints(HASHES, 500)]]);
  const [top] = match(index, prints(HASHES, 0));

  expect(top!.songId).toBe(1);
  expect(top!.offsetBucket).toBe(250);
  expect(top!.votes).toBe(20);
});

test("reports one alignment per song when a chorus repeats", () => {
  const index = buildIndex([
    [1, [...prints(HASHES, 500), ...prints(HASHES.slice(0, 12), 900)]],
    [2, prints(HASHES.slice(0, 7), 300)],
  ]);
  const results = match(index, prints(HASHES, 0));

  expect(results).toEqual([
    { songId: 1, offsetBucket: 250, votes: 20 },
    { songId: 2, offsetBucket: 150, votes: 7 },
  ]);
});

test("ignores alignments weaker than the vote floor", () => {
  const index = buildIndex([[1, prints(HASHES.slice(0, MIN_VOTES - 1), 500)]]);

  expect(match(index, prints(HASHES, 0))).toEqual([]);
});

test("ignores negative offsets, which no real snippet can produce", () => {
  const index = buildIndex([[1, prints(HASHES, 0)]]);

  expect(match(index, prints(HASHES, 500))).toEqual([]);
});

test("converts an offset bucket to seconds", () => {
  expect(offsetSeconds(250)).toBeCloseTo(250 * OFFSET_BUCKET * FRAME_DURATION, 10);
  expect(offsetSeconds(250)).toBeCloseTo(23.22, 2);
});
