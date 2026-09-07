import { Database } from "bun:sqlite";
import { extractPeaks, fingerprint, spectrogram, type Fingerprint } from "@chirp/core";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";

const corpus = await loadCorpus();
const queries: Fingerprint[][] = [];
for (let i = 0; i < 8; i++) {
  for (const at of [30, 60.5, 90]) {
    queries.push(fingerprint(extractPeaks(spectrogram(await decode(trackPath(corpus[i]!), at, 6)))));
  }
}
const pairs = (q: readonly Fingerprint[]) => JSON.stringify(q.map((p) => [p.hash, p.frame]));

console.log("  songs   single    stage1   stage2    two-stage   ratio");
for (const chunk of [0, 646, 162, 40, 10, 3]) {
  await Bun.$`cp chirp.sqlite /tmp/xover.sqlite`.quiet();
  const db = new Database("/tmp/xover.sqlite");
  db.run("PRAGMA journal_mode = WAL");
  if (chunk > 0) {
    db.run(`CREATE TABLE fp2 (hash INTEGER NOT NULL, song_id INTEGER NOT NULL,
            anchor_frame INTEGER NOT NULL, PRIMARY KEY (hash, song_id, anchor_frame)) WITHOUT ROWID`);
    db.run(`INSERT OR IGNORE INTO fp2 SELECT hash, song_id * 100000 + anchor_frame / ${chunk}, anchor_frame FROM fingerprints`);
    db.run("DROP TABLE fingerprints");
    db.run("ALTER TABLE fp2 RENAME TO fingerprints");
  }
  const songs = db.query<{ n: number }, []>("SELECT COUNT(DISTINCT song_id) n FROM fingerprints").get()!.n;

  const one = (sql: string, a: (string | number)[]) => db.query<{ n: number }, (string|number)[]>(sql).get(...a)!.n;
  const KEPT = `WITH q(hash) AS (SELECT json_extract(value,'$[0]') FROM json_each(?1)),
    kept AS (SELECT q.hash FROM q LEFT JOIN hash_stats hs ON hs.hash=q.hash WHERE COALESCE(hs.postings,0) <= 512)
    SELECT COUNT(*) n FROM kept JOIN fingerprints f ON f.hash = kept.hash`;
  const RARE = `WITH q(hash) AS (SELECT json_extract(value,'$[0]') FROM json_each(?1)),
    rare AS (SELECT q.hash FROM q LEFT JOIN hash_stats hs ON hs.hash=q.hash WHERE hs.hash IS NULL)
    SELECT COUNT(*) n FROM rare JOIN fingerprints f ON f.hash = rare.hash`;
  const CAND = `WITH q(hash,qframe) AS (SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?1)),
    rare AS (SELECT q.hash,q.qframe FROM q LEFT JOIN hash_stats hs ON hs.hash=q.hash WHERE hs.hash IS NULL),
    t AS (SELECT f.song_id, CAST(FLOOR((f.anchor_frame-rare.qframe)/2.0) AS INTEGER) b, COUNT(*) v
          FROM rare JOIN fingerprints f ON f.hash=rare.hash GROUP BY f.song_id,b HAVING b>=0)
    SELECT song_id FROM (SELECT song_id, MAX(v) v FROM t GROUP BY song_id ORDER BY v DESC LIMIT 20)`;
  const VER = `WITH q(hash) AS (SELECT json_extract(value,'$[0]') FROM json_each(?1)),
    cand(song_id) AS (SELECT value FROM json_each(?2)),
    kept AS (SELECT q.hash FROM q LEFT JOIN hash_stats hs ON hs.hash=q.hash WHERE COALESCE(hs.postings,0) <= 512)
    SELECT COUNT(*) n FROM kept CROSS JOIN cand JOIN fingerprints f ON f.hash=kept.hash AND f.song_id=cand.song_id`;

  const avg = (a: number[]) => a.reduce((s,n)=>s+n,0)/a.length;
  const single = avg(queries.map(q => one(KEPT, [pairs(q)])));
  const s1 = avg(queries.map(q => one(RARE, [pairs(q)])));
  const s2 = avg(queries.map(q => {
    const c = db.query<{song_id:number},[string]>(CAND).all(pairs(q)).map(r=>r.song_id);
    return c.length ? one(VER, [pairs(q), JSON.stringify(c)]) : 0;
  }));
  console.log(`${String(songs).padStart(7)}${Math.round(single).toLocaleString().padStart(9)}` +
    `${Math.round(s1).toLocaleString().padStart(10)}${Math.round(s2).toLocaleString().padStart(9)}` +
    `${Math.round(s1+s2).toLocaleString().padStart(12)}${((s1+s2)/single).toFixed(2).padStart(8)}x`);
  db.close();
}
