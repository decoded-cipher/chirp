import { extractPeaks, fingerprint, frameCount, spectrogram } from "@chirp/core";
import { loadCorpus, trackPath } from "./corpus";
import { decode } from "./decode";
import { insertFingerprints, insertSong, openIndex, refreshHashStats } from "./store";

const target = process.argv[2] ?? "chirp.sqlite";
const limit = Number(process.argv[3] ?? Infinity);

const corpus = (await loadCorpus()).slice(0, limit);
const db = openIndex(target);

let totalHashes = 0;
const started = performance.now();

for (const [i, track] of corpus.entries()) {
  const pcm = await decode(trackPath(track));
  const prints = fingerprint(extractPeaks(spectrogram(pcm)));

  const songId = insertSong(db, { ...track, frame_count: frameCount(pcm.length) });
  insertFingerprints(db, songId, prints);
  totalHashes += prints.length;

  console.log(
    `  [${String(i + 1).padStart(2)}/${corpus.length}] ${track.artist.slice(0, 22).padEnd(24)} ` +
      `${String(prints.length).padStart(6)} hashes`,
  );
}

const heavy = refreshHashStats(db);
db.run("VACUUM");

const elapsed = (performance.now() - started) / 1000;
const rows = db.query<{ n: number }, []>("SELECT COUNT(*) n FROM fingerprints").get()!.n;
const bytes = db.query<{ n: number }, []>("SELECT page_count * page_size n FROM pragma_page_count(), pragma_page_size()").get()!.n;

console.log(
  `\n${corpus.length} tracks, ${rows.toLocaleString()} rows, ` +
    `${(bytes / 1e6).toFixed(1)} MB (${Math.round(bytes / corpus.length / 1024)} KB/track), ` +
    `${totalHashes.toLocaleString()} hashes in ${elapsed.toFixed(1)}s`,
);
console.log(`${heavy.toLocaleString()} hashes flagged too common to identify anything (skipped at query time, not deleted)`);
