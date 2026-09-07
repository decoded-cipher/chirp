import { FRAME_DURATION, MIN_MARGIN, MIN_VOTES, OFFSET_BUCKET } from "./constants";
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

export interface Identification extends Match {
  confidence: number;
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

export function tally(index: Index, query: readonly Fingerprint[]): Match[] {
  const counts = new Map<number, Map<number, number>>();

  for (const { hash, frame } of query) {
    const postings = index.get(hash);
    if (!postings) continue;

    for (const posting of postings) {
      const delta = posting.frame - frame;
      if (delta < 0) continue;

      const bucket = Math.floor(delta / OFFSET_BUCKET);
      let buckets = counts.get(posting.songId);
      if (!buckets) {
        buckets = new Map();
        counts.set(posting.songId, buckets);
      }
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
  }

  const rows: Match[] = [];
  for (const [songId, buckets] of counts) {
    for (const [offsetBucket, votes] of buckets) rows.push({ songId, offsetBucket, votes });
  }
  return rows.sort((a, b) => b.votes - a.votes);
}

export function mergeTallies(previous: readonly Match[], next: readonly Match[]): Match[] {
  const totals = new Map<string, Match>();

  for (const row of [...previous, ...next]) {
    const key = `${row.songId}:${row.offsetBucket}`;
    const seen = totals.get(key);
    if (seen) seen.votes += row.votes;
    else totals.set(key, { ...row });
  }

  return [...totals.values()].sort((a, b) => b.votes - a.votes);
}

export function bestPerSong(rows: readonly Match[]): Match[] {
  const best = new Map<number, Match>();

  for (const row of rows) {
    const seen = best.get(row.songId);
    if (!seen || row.votes > seen.votes) best.set(row.songId, row);
  }

  return [...best.values()].sort((a, b) => b.votes - a.votes);
}

export function match(index: Index, query: readonly Fingerprint[]): Match[] {
  return bestPerSong(tally(index, query)).filter((m) => m.votes >= MIN_VOTES);
}

export function decide(ranked: readonly Match[]): Identification | null {
  const top = ranked[0];
  if (!top) return null;

  const confidence = ranked[1] ? top.votes / ranked[1].votes : Infinity;
  return confidence >= MIN_MARGIN ? { ...top, confidence } : null;
}

export function identify(index: Index, query: readonly Fingerprint[]): Identification | null {
  return decide(match(index, query));
}

export function offsetSeconds(offsetBucket: number): number {
  return offsetBucket * OFFSET_BUCKET * FRAME_DURATION;
}
