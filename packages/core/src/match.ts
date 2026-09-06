import { FRAME_DURATION, MIN_VOTES, OFFSET_BUCKET } from "./constants";
import type { Fingerprint } from "./hash";

export interface Posting {
  songId: number;
  frame: number;
}

export type Index = Map<number, Posting[]>;

export interface Match {
  songId: number;
  offsetBucket: number;
  votes: number;
}

export function buildIndex(songs: Iterable<readonly [number, readonly Fingerprint[]]>): Index {
  const index: Index = new Map();

  for (const [songId, prints] of songs) {
    for (const { hash, frame } of prints) {
      const postings = index.get(hash);
      if (postings) postings.push({ songId, frame });
      else index.set(hash, [{ songId, frame }]);
    }
  }

  return index;
}

/**
 * Mirrors the D1 query in docs/architecture.md §6, including its one-row-per-song
 * rule. A track whose chorus repeats aligns at several offsets, and without that
 * rule its weaker alignments crowd out genuine runners-up.
 */
export function match(index: Index, query: readonly Fingerprint[]): Match[] {
  const tally = new Map<number, Map<number, number>>();

  for (const { hash, frame } of query) {
    const postings = index.get(hash);
    if (!postings) continue;

    for (const posting of postings) {
      const delta = posting.frame - frame;
      if (delta < 0) continue;

      const bucket = Math.floor(delta / OFFSET_BUCKET);
      let buckets = tally.get(posting.songId);
      if (!buckets) {
        buckets = new Map();
        tally.set(posting.songId, buckets);
      }
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
  }

  const matches: Match[] = [];
  for (const [songId, buckets] of tally) {
    let offsetBucket = 0;
    let votes = 0;
    for (const [bucket, count] of buckets) {
      if (count > votes) {
        votes = count;
        offsetBucket = bucket;
      }
    }
    if (votes >= MIN_VOTES) matches.push({ songId, offsetBucket, votes });
  }

  return matches.sort((a, b) => b.votes - a.votes);
}

export function offsetSeconds(offsetBucket: number): number {
  return offsetBucket * OFFSET_BUCKET * FRAME_DURATION;
}
