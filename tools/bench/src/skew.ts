import { connect } from "@chirp/db";

const db = connect(process.env.PG_URL ?? "postgres://chirp:chirp@localhost:55432/chirp");

const [totals] = await db<{ postings: number; hashes: number; tracks: number }[]>`
  SELECT (SELECT COUNT(*)::int FROM fingerprints) postings,
         (SELECT COUNT(DISTINCT hash)::int FROM fingerprints) hashes,
         (SELECT COUNT(*)::int FROM songs) tracks`;

console.log(`  ${totals!.tracks} tracks, ${totals!.postings.toLocaleString()} postings across ` +
  `${totals!.hashes.toLocaleString()} distinct hashes ` +
  `(${(totals!.postings / totals!.hashes).toFixed(2)} per hash)\n`);

const rows = await db<{ bucket: string; hashes: number; postings: number; share: number }[]>`
  WITH p AS (SELECT hash, COUNT(*)::int n FROM fingerprints GROUP BY hash)
  SELECT CASE WHEN n = 1 THEN 'exactly 1'
              WHEN n <= 8 THEN '2 to 8'
              WHEN n <= 32 THEN '9 to 32'
              WHEN n <= 128 THEN '33 to 128'
              WHEN n <= 512 THEN '129 to 512'
              ELSE 'over 512' END AS bucket,
         COUNT(*)::int hashes, SUM(n)::int postings,
         ROUND(100.0 * SUM(n) / (SELECT SUM(n) FROM p), 1)::float share
  FROM p GROUP BY 1
  ORDER BY MIN(n)`;

console.log("  postings per hash      hashes      postings   share of index");
for (const r of rows) {
  console.log(`  ${r.bucket.padEnd(18)}${r.hashes.toLocaleString().padStart(11)}` +
    `${r.postings.toLocaleString().padStart(14)}${`${r.share}%`.padStart(12)}`);
}
await db.end();
