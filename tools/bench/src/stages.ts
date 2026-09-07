import { Database } from "bun:sqlite";
import { decide, extractPeaks, fingerprint, spectrogram, type Fingerprint } from "@chirp/core";
import { CANDIDATES } from "@chirp/db";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";
import { rank, rankTwoStage } from "@chirp/ingest/store";
import { mixNoise } from "./degrade";

const db = new Database("chirp.sqlite", { readonly: true });
const corpus = await loadCorpus();
const OFFSETS = [30, 60.5, 90];
const QUERIED = 12;

const clean: Fingerprint[][] = [];
const noisy: Fingerprint[][] = [];
const owner: number[] = [];

for (let i = 0; i < QUERIED; i++) {
  for (const at of OFFSETS) {
    const pcm = await decode(trackPath(corpus[i]!), at, 6);
    clean.push(fingerprint(extractPeaks(spectrogram(pcm))));
    noisy.push(fingerprint(extractPeaks(spectrogram(mixNoise(pcm, 0, i * 31 + at)))));
    owner.push(i + 1);
  }
}

const pairs = (q: readonly Fingerprint[]) => JSON.stringify(q.map((p) => [p.hash, p.frame]));

const KEPT_ROWS = `
WITH q(hash) AS (SELECT json_extract(value,'$[0]') FROM json_each(?1)),
kept AS (SELECT q.hash FROM q LEFT JOIN hash_stats hs ON hs.hash = q.hash
         WHERE COALESCE(hs.postings, 0) <= ?2)
SELECT COUNT(*) n FROM kept JOIN fingerprints f ON f.hash = kept.hash`;

const RARE_ROWS = `
WITH q(hash) AS (SELECT json_extract(value,'$[0]') FROM json_each(?1)),
rare AS (SELECT q.hash FROM q LEFT JOIN hash_stats hs ON hs.hash = q.hash WHERE hs.hash IS NULL)
SELECT COUNT(*) n FROM rare JOIN fingerprints f ON f.hash = rare.hash`;

const VERIFY_ROWS = `
WITH q(hash) AS (SELECT json_extract(value,'$[0]') FROM json_each(?1)),
cand(song_id) AS (SELECT value FROM json_each(?2)),
kept AS (SELECT q.hash FROM q LEFT JOIN hash_stats hs ON hs.hash = q.hash
         WHERE COALESCE(hs.postings, 0) <= ?3)
SELECT COUNT(*) n FROM kept CROSS JOIN cand
JOIN fingerprints f ON f.hash = kept.hash AND f.song_id = cand.song_id`;

const scalar = (sql: string, args: (string | number)[]) =>
  db.query<{ n: number }, (string | number)[]>(sql).get(...args)!.n;

const distinctHashes = (q: readonly Fingerprint[]) => new Set(q.map((p) => p.hash)).size;

interface Strategy {
  label: string;
  identify: (q: readonly Fingerprint[]) => number | undefined;
  rows: (q: readonly Fingerprint[]) => number;
}

const singleStage = (cap: number): Strategy => ({
  label: `single  cap ${cap === Infinity ? "none" : cap}`,
  identify: (q) => decide(rank(db, q, cap))?.songId,
  rows: (q) => distinctHashes(q) + scalar(KEPT_ROWS, [pairs(q), cap]),
});

const twoStage = (cap: number, keep: number): Strategy => ({
  label: `two     cap ${cap} keep ${keep}`,
  identify: (q) => decide(rankTwoStage(db, q, cap, keep))?.songId,
  rows: (q) => {
    const p = pairs(q);
    const candidates = db.query<{ song_id: number }, [string, number]>(CANDIDATES)
      .all(p, keep).map((r) => r.song_id);
    const stage1 = distinctHashes(q) + scalar(RARE_ROWS, [p]);
    if (candidates.length === 0) return stage1;
    return stage1 + scalar(VERIFY_ROWS, [p, JSON.stringify(candidates), cap]);
  },
});

const strategies: Strategy[] = [
  singleStage(Infinity),
  singleStage(512),
  singleStage(128),
  singleStage(64),
  singleStage(32),
  twoStage(512, 20),
  twoStage(512, 5),
];

const mean = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;

console.log(`  index: ${
  db.query<{ n: number }, []>("SELECT COUNT(*) n FROM fingerprints").get()!.n.toLocaleString()
} rows, ${corpus.length} tracks, ${clean.length} queries each\n`);
console.log("  strategy               clean    0 dB SNR   rows/query   vs base   latency");

let base = 0;
for (const s of strategies) {
  const hit = (queries: Fingerprint[][]) =>
    queries.filter((q, n) => s.identify(q) === owner[n]).length;

  const t0 = performance.now();
  const c = hit(clean);
  const latency = (performance.now() - t0) / clean.length;
  const n = hit(noisy);
  const rows = mean(clean.map(s.rows));
  if (!base) base = rows;

  console.log(
    `  ${s.label.padEnd(22)}` +
      `${`${c}/${clean.length}`.padStart(7)}` +
      `${`${n}/${noisy.length}`.padStart(11)}` +
      `${Math.round(rows).toLocaleString().padStart(13)}` +
      `${`${(rows / base).toFixed(2)}x`.padStart(10)}` +
      `${latency.toFixed(1).padStart(9)}ms`,
  );
}
