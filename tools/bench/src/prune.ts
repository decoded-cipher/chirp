import { extractPeaks, fingerprint, sampleFingerprints, spectrogram, type Fingerprint } from "@chirp/core";
import { connect, identifyIn } from "@chirp/db";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";
import { mixNoise } from "./degrade";

const db = connect(process.env.PG_URL ?? "postgres://chirp:chirp@localhost:55432/chirp");
const corpus = await loadCorpus();
const OFFSETS = [30, 60.5, 90];
const QUERIED = 12;

const clean: Fingerprint[][] = [];
const noisy: Fingerprint[][] = [];
const owner: number[] = [];
for (let i = 0; i < QUERIED; i++) {
  for (const at of OFFSETS) {
    const pcm = await decode(trackPath(corpus[i]!), at, 6);
    clean.push(sampleFingerprints(fingerprint(extractPeaks(spectrogram(pcm)))));
    noisy.push(sampleFingerprints(fingerprint(extractPeaks(spectrogram(mixNoise(pcm, 0, i * 31 + at))))));
    owner.push(i + 1);
  }
}

console.log("  The cap is applied at query time, so this sweeps the parameter");
console.log("  rather than deleting postings.\n");
console.log("  cap        skipped hashes   clean    0 dB SNR   latency");

for (const cap of [1_000_000, 512, 128, 64, 32]) {
  const [{ n: skipped }] = await db<{ n: number }[]>`
    SELECT COUNT(*)::int n FROM hash_stats WHERE postings > ${cap}`;

  const score = async (queries: Fingerprint[][]) => {
    let hit = 0;
    for (const [n, q] of queries.entries()) {
      if ((await identifyIn(db, q, cap))?.songId === owner[n]) hit++;
    }
    return hit;
  };

  const started = performance.now();
  const c = await score(clean);
  const latency = (performance.now() - started) / clean.length;
  const n = await score(noisy);

  console.log(
    `${(cap > 100_000 ? "none" : String(cap)).padStart(6)}` +
      `${skipped.toLocaleString().padStart(17)}` +
      `${`${c}/${clean.length}`.padStart(10)}` +
      `${`${n}/${noisy.length}`.padStart(11)}` +
      `${`${latency.toFixed(0)}ms`.padStart(10)}`,
  );
}
await db.end();
