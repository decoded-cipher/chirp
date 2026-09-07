import { expect, test } from "bun:test";
import { FRAME_DURATION, MIN_VOTES, OFFSET_BUCKET } from "./constants";
import type { Fingerprint } from "./hash";
import { bestPerSong, buildIndex, identify, match, mergeTallies, offsetSeconds, tally } from "./match";

function prints(hashes: number[], startFrame: number): Fingerprint[] {
  return hashes.map((hash, i) => ({ hash, frame: startFrame + i }));
}

const HASHES = Array.from({ length: 60 }, (_, i) => 100 + i);

test("recovers the song and its offset", () => {
  const index = buildIndex([[1, prints(HASHES, 500)]]);
  const [top] = match(index, prints(HASHES, 0));

  expect(top!.songId).toBe(1);
  expect(top!.offsetBucket).toBe(250);
  expect(top!.votes).toBe(60);
});

test("reports one alignment per song when a chorus repeats", () => {
  const index = buildIndex([
    [1, [...prints(HASHES, 500), ...prints(HASHES.slice(0, 40), 900)]],
    [2, prints(HASHES.slice(0, 25), 300)],
  ]);

  expect(match(index, prints(HASHES, 0))).toEqual([
    { songId: 1, offsetBucket: 250, votes: 60 },
    { songId: 2, offsetBucket: 150, votes: 25 },
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

test("identifies a clear winner", () => {
  const index = buildIndex([
    [1, prints(HASHES, 500)],
    [2, prints(HASHES.slice(0, 25), 300)],
  ]);
  const result = identify(index, prints(HASHES, 0));

  expect(result!.songId).toBe(1);
  expect(result!.confidence).toBeCloseTo(60 / 25, 5);
});

test("refuses to identify when no candidate stands out", () => {
  const index = buildIndex([
    [1, prints(HASHES, 500)],
    [2, prints(HASHES, 900)],
  ]);

  expect(identify(index, prints(HASHES, 0))).toBeNull();
});

test("converts an offset bucket to seconds", () => {
  expect(offsetSeconds(250)).toBeCloseTo(250 * OFFSET_BUCKET * FRAME_DURATION, 10);
  expect(offsetSeconds(250)).toBeCloseTo(23.22, 2);
});

test("splitting a query across rounds tallies the same as sending it whole", () => {
  const index = buildIndex([
    [1, [...prints(HASHES, 500), ...prints(HASHES.slice(0, 40), 900)]],
    [2, prints(HASHES.slice(0, 25), 300)],
  ]);

  const whole = prints(HASHES, 0);
  const rounds = [whole.slice(0, 20), whole.slice(20, 45), whole.slice(45)];

  const incremental = rounds
    .map((round) => tally(index, round))
    .reduce((carried, round) => mergeTallies(carried, round));

  expect(bestPerSong(incremental)).toEqual(bestPerSong(tally(index, whole)));
});

test("merging tallies sums votes for a shared alignment", () => {
  expect(mergeTallies(
    [{ songId: 1, offsetBucket: 250, votes: 12 }],
    [{ songId: 1, offsetBucket: 250, votes: 8 }, { songId: 2, offsetBucket: 4, votes: 5 }],
  )).toEqual([
    { songId: 1, offsetBucket: 250, votes: 20 },
    { songId: 2, offsetBucket: 4, votes: 5 },
  ]);
});
