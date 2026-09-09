import { extractPeaks, fingerprint, frameCount, spectrogram } from "@chirp/core";
import { PG_SCHEMA, connect, insertFingerprints, insertSong, refreshHashStats } from "@chirp/db";
import { loadCorpus, trackPath } from "./corpus";
import { decode } from "./decode";

const db = connect(process.env.PG_URL ?? "postgres://chirp:chirp@localhost:55432/chirp");
const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? Infinity);

if (process.argv.includes("--reset")) {
  await db.unsafe("DROP TABLE IF EXISTS fingerprints, hash_stats, songs CASCADE");
}
for (const statement of PG_SCHEMA) await db.unsafe(statement);

const corpus = (await loadCorpus()).slice(0, limit);
const started = performance.now();
let postings = 0;

for (const [i, track] of corpus.entries()) {
  const pcm = await decode(trackPath(track));
  const prints = fingerprint(extractPeaks(spectrogram(pcm)));

  const { id } = await insertSong(db, { ...track, frame_count: frameCount(pcm.length) });
  await insertFingerprints(db, id, prints);
  postings += prints.length;

  console.log(
    `  [${String(i + 1).padStart(2)}/${corpus.length}] ${track.title.slice(0, 34).padEnd(36)} ` +
      `${String(prints.length).padStart(6)} hashes`,
  );
}

const heavy = await refreshHashStats(db);
await db.unsafe("ANALYZE");

const [{ pretty }] = await db<{ pretty: string }[]>`
  SELECT pg_size_pretty(pg_total_relation_size('fingerprints')
       + pg_total_relation_size('hash_stats') + pg_total_relation_size('songs')) pretty`;

console.log(
  `\n${corpus.length} tracks, ${postings.toLocaleString()} postings, ${pretty} ` +
    `in ${((performance.now() - started) / 1000).toFixed(1)}s`,
);
console.log(`${heavy.toLocaleString()} hashes flagged too common to identify anything`);
await db.end();
