import { Database } from "bun:sqlite";
import { extractPeaks, fingerprint, offsetSeconds, spectrogram, type Fingerprint } from "@chirp/core";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";
import { identifyIn, rank } from "@chirp/ingest/store";

const db = new Database("chirp.sqlite", { readonly: true });
const corpus = await loadCorpus();
const OFFSETS = [30, 60.5, 90];

const joinRows = (q: readonly Fingerprint[]) =>
  db.query<{ n: number }, [string]>(`
    WITH q(hash, qframe) AS (SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]') FROM json_each(?1))
    SELECT COUNT(*) n FROM q JOIN fingerprints f ON f.hash = q.hash`)
    .get(JSON.stringify(q.map((p) => [p.hash, p.frame])))!.n;

let correct = 0;
let total = 0;
const latencies: number[] = [];
const scans: number[] = [];
const hashCounts: number[] = [];

for (let i = 0; i < 12; i++) {
  for (const at of OFFSETS) {
    const query = fingerprint(extractPeaks(spectrogram(await decode(trackPath(corpus[i]!), at, 6))));
    hashCounts.push(query.length);
    scans.push(joinRows(query));

    const t0 = performance.now();
    const result = identifyIn(db, query);
    latencies.push(performance.now() - t0);

    total++;
    if (result?.songId === i + 1) correct++;
    if (i === 0 && at === 30) {
      console.log(`  sample: song ${result?.songId} @ ${offsetSeconds(result!.offsetBucket).toFixed(2)}s ` +
        `votes ${result!.votes} confidence ${result!.confidence.toFixed(1)}x`);
    }
  }
}

const p = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)]!;
const mean = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
const rows = db.query<{ n: number }, []>("SELECT COUNT(*) n FROM fingerprints").get()!.n;

console.log(`\n  index:      ${rows.toLocaleString()} rows across ${corpus.length} tracks`);
console.log(`  accuracy:   ${correct}/${total} through SQL`);
console.log(`  query size: ${Math.round(mean(hashCounts))} hashes (6s snippet)`);
console.log(`  rows read:  mean ${Math.round(mean(scans)).toLocaleString()}  p95 ${p(scans, 0.95).toLocaleString()}`);
console.log(`  latency:    mean ${mean(latencies).toFixed(1)}ms  p95 ${p(latencies, 0.95).toFixed(1)}ms`);
console.log(`\n  at ${Math.round(mean(scans)).toLocaleString()} rows/query, D1's 5M free daily read limit allows ~${Math.floor(5e6 / mean(scans)).toLocaleString()} identifications/day`);
