import {
  decide, extractPeaks, fingerprint, frameCount, sampleFingerprints, spectrogram,
  type Fingerprint,
} from "@chirp/core";
import {
  PG_SCHEMA, asMatches, connect, insertFingerprints, insertSong, rank, refreshHashStats,
} from "@chirp/db";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";
import { mixNoise } from "./degrade";

const db = connect(process.env.PG_URL ?? "postgres://chirp:chirp@localhost:55432/chirp");
const corpus = await loadCorpus();
const OFFSETS = [30, 60.5, 90];
const QUERIED = 12;

console.log("  building schema…");
await db.unsafe("DROP TABLE IF EXISTS fingerprints, hash_stats, songs CASCADE");
for (const statement of PG_SCHEMA) await db.unsafe(statement);

console.log(`  ingesting ${corpus.length} tracks…`);
const started = Date.now();
let postings = 0;

for (const [i, track] of corpus.entries()) {
  const pcm = await decode(trackPath(track));
  const prints = fingerprint(extractPeaks(spectrogram(pcm)));
  const { id } = await insertSong(db, { ...track, frame_count: frameCount(pcm.length) });
  await insertFingerprints(db, id, prints);
  postings += prints.length;
  if ((i + 1) % 9 === 0) console.log(`    ${i + 1}/${corpus.length}`);
}

const heavy = await refreshHashStats(db);
await db.unsafe("ANALYZE");

const [{ pretty }] = await db<{ pretty: string }[]>`
  SELECT pg_size_pretty(pg_total_relation_size('fingerprints')
       + pg_total_relation_size('hash_stats') + pg_total_relation_size('songs')) pretty`;
console.log(`  ${postings.toLocaleString()} postings, ${heavy.toLocaleString()} tracked hashes, ` +
  `${pretty} in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);

const query = (pcm: Float32Array): Fingerprint[] =>
  sampleFingerprints(fingerprint(extractPeaks(spectrogram(pcm))));

for (const [label, snr] of [["clean", null], ["0 dB SNR", 0]] as const) {
  let hit = 0, wrong = 0, count = 0, points = 0;
  const times: number[] = [];

  for (let i = 0; i < QUERIED; i++) {
    for (const at of OFFSETS) {
      const pcm = await decode(trackPath(corpus[i]!), at, 6);
      const q = query(snr === null ? pcm : mixNoise(pcm, snr, i * 31 + at));

      const t0 = performance.now();
      const { candidates, histogram } = await rank(db, q);
      times.push(performance.now() - t0);

      const chosen = decide(asMatches(candidates));
      count++;
      points += histogram.length;
      if (chosen?.songId === i + 1) hit++;
      else if (chosen) wrong++;
    }
  }

  const p95 = [...times].sort((a, b) => a - b)[Math.floor(times.length * 0.95)]!;
  const mean = times.reduce((s, n) => s + n, 0) / times.length;
  console.log(`  ${label.padEnd(9)} ${hit}/${count} correct, ${wrong} wrong  ` +
    `query mean ${mean.toFixed(1)}ms p95 ${p95.toFixed(1)}ms  avg histogram ${Math.round(points / count)} points`);
}

await db.end();
