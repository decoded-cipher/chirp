import { Database } from "bun:sqlite";
import { extractPeaks, fingerprint, spectrogram } from "@chirp/core";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";

const db = new Database("chirp.sqlite", { readonly: true });
const corpus = await loadCorpus();

const total = db.query<{ n: number }, []>("SELECT COUNT(*) n FROM fingerprints").get()!.n;
const distinct = db.query<{ n: number }, []>("SELECT COUNT(*) n FROM (SELECT hash FROM fingerprints GROUP BY hash)").get()!.n;
console.log(`${total.toLocaleString()} rows, ${distinct.toLocaleString()} distinct hashes, mean ${(total / distinct).toFixed(1)} postings/hash\n`);

console.log("posting-count distribution:");
for (const row of db.query<{ bucket: string; hashes: number; rows: number }, []>(`
  SELECT CASE
    WHEN c <= 8 THEN 'a <=8' WHEN c <= 32 THEN 'b <=32' WHEN c <= 128 THEN 'c <=128'
    WHEN c <= 512 THEN 'd <=512' WHEN c <= 2048 THEN 'e <=2048' ELSE 'f >2048' END AS bucket,
    COUNT(*) AS hashes, SUM(c) AS rows
  FROM (SELECT hash, COUNT(*) c FROM fingerprints GROUP BY hash)
  GROUP BY bucket ORDER BY bucket`).all()) {
  console.log(`  ${row.bucket.slice(2).padEnd(7)} ${String(row.hashes).padStart(7)} hashes  ` +
    `${String(row.rows).padStart(9)} rows  ${((row.rows / total) * 100).toFixed(1).padStart(5)}% of index`);
}

const query = fingerprint(extractPeaks(spectrogram(await decode(trackPath(corpus[0]!), 30, 6))));
const pairs = JSON.stringify(query.map((p) => [p.hash, p.frame]));

console.log("\ncost of a single query under a per-hash posting cap:");
for (const cap of [0, 2048, 512, 128, 64, 32]) {
  const sql = cap === 0
    ? `WITH q(hash) AS (SELECT json_extract(value,'$[0]') FROM json_each(?1))
       SELECT COUNT(*) n FROM q JOIN fingerprints f ON f.hash = q.hash`
    : `WITH q(hash) AS (SELECT json_extract(value,'$[0]') FROM json_each(?1)),
            heavy AS (SELECT hash FROM fingerprints GROUP BY hash HAVING COUNT(*) > ${cap})
       SELECT COUNT(*) n FROM q JOIN fingerprints f ON f.hash = q.hash
       WHERE f.hash NOT IN (SELECT hash FROM heavy)`;
  const n = db.query<{ n: number }, [string]>(sql).get(pairs)!.n;
  console.log(`  cap ${cap === 0 ? "none" : String(cap).padStart(4)}  ${String(n).padStart(7)} rows read`);
}
