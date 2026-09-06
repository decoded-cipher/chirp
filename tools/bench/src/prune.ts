import { Database } from "bun:sqlite";
import { extractPeaks, fingerprint, spectrogram, type Fingerprint } from "@chirp/core";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";
import { identifyIn } from "@chirp/ingest/store";
import { mixNoise } from "./degrade";

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

console.log("  cap    rows      index      clean    0 dB SNR   rows/query   latency");
for (const cap of [0, 512, 128, 64, 32, 16]) {
  await Bun.$`cp chirp.sqlite /tmp/chirp-cap.sqlite`.quiet();
  const db = new Database("/tmp/chirp-cap.sqlite");
  if (cap > 0) {
    db.run(`DELETE FROM fingerprints WHERE hash IN
            (SELECT hash FROM fingerprints GROUP BY hash HAVING COUNT(*) > ${cap})`);
    db.run("VACUUM");
  }

  const rows = db.query<{ n: number }, []>("SELECT COUNT(*) n FROM fingerprints").get()!.n;
  const bytes = db.query<{ n: number }, []>("SELECT page_count * page_size n FROM pragma_page_count(), pragma_page_size()").get()!.n;

  const score = (queries: Fingerprint[][]) =>
    queries.filter((q, n) => identifyIn(db, q)?.songId === owner[n]).length;

  const scans = clean.map((q) =>
    db.query<{ n: number }, [string]>(`
      WITH q(hash) AS (SELECT json_extract(value,'$[0]') FROM json_each(?1))
      SELECT COUNT(*) n FROM q JOIN fingerprints f ON f.hash = q.hash`)
      .get(JSON.stringify(q.map((p) => [p.hash, p.frame])))!.n);

  const t0 = performance.now();
  const c = score(clean);
  const latency = (performance.now() - t0) / clean.length;
  const n = score(noisy);

  console.log(
    `${(cap === 0 ? "none" : String(cap)).padStart(6)}` +
      `${(rows / 1000).toFixed(0).padStart(7)}k` +
      `${(bytes / 1e6).toFixed(1).padStart(8)} MB` +
      `${`${c}/${clean.length}`.padStart(10)}` +
      `${`${n}/${noisy.length}`.padStart(11)}` +
      `${Math.round(scans.reduce((a, b) => a + b, 0) / scans.length).toLocaleString().padStart(12)}` +
      `${latency.toFixed(0).padStart(9)}ms`,
  );
  db.close();
}
