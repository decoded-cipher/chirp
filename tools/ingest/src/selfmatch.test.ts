import { expect, test } from "bun:test";
import { buildIndex, extractPeaks, fingerprint, identify, offsetSeconds, spectrogram, type Fingerprint } from "@chirp/core";
import { loadCorpus, trackPath } from "./corpus";
import { decode } from "./decode";

const corpus = await loadCorpus();
const hasAudio = await Bun.file(trackPath(corpus[0]!)).exists();
const INDEXED = 6;

async function printsFor(path: string, from?: number, duration?: number): Promise<Fingerprint[]> {
  return fingerprint(extractPeaks(spectrogram(await decode(path, from, duration))));
}

async function buildCorpusIndex() {
  return buildIndex(
    await Promise.all(
      corpus.slice(0, INDEXED).map(async (t, i) => [i, await printsFor(trackPath(t))] as const),
    ),
  );
}

function overlap(a: readonly Fingerprint[], b: readonly Fingerprint[]): number {
  const hashes = new Set(b.map((p) => p.hash));
  return a.filter((p) => hashes.has(p.hash)).length / a.length;
}

test.skipIf(!hasAudio)("identifies each indexed track from a six-second slice", async () => {
  const index = await buildCorpusIndex();

  for (let i = 0; i < INDEXED; i++) {
    const path = trackPath(corpus[i]!);
    for (const at of [30, 60.5]) {
      const query = await printsFor(path, at, 6);
      const result = identify(index, query);
      expect(result?.songId).toBe(i);

      // Looping music repeats verbatim, so the recovered position is only
      // required to hold equivalent audio, not to be the sampled timestamp.
      const recovered = await printsFor(path, offsetSeconds(result!.offsetBucket), 6);
      expect(overlap(query, recovered)).toBeGreaterThan(0.5);
    }
  }
}, 180_000);

test.skipIf(!hasAudio)("recovers the exact timestamp for non-repeating audio", async () => {
  const index = await buildCorpusIndex();
  const path = trackPath(corpus[3]!);

  for (const at of [30, 60.5]) {
    const result = identify(index, await printsFor(path, at, 6));
    expect(offsetSeconds(result!.offsetBucket)).toBeCloseTo(at, 1);
  }
}, 180_000);

test.skipIf(!hasAudio)("refuses to identify a track that is not indexed", async () => {
  const index = await buildCorpusIndex();

  for (const at of [30, 60.5]) {
    expect(identify(index, await printsFor(trackPath(corpus[9]!), at, 6))).toBeNull();
  }
}, 180_000);
