import { extractPeaks, fingerprint, frameCount, spectrogram } from "@chirp/core";
import { FINGERPRINT_CHUNK } from "@chirp/db";
import { get, post } from "./api";
import { ROOT, type CorpusTrack } from "./corpus";
import { decode, probe } from "./decode";
import { download, resolve } from "./resolve";
import { findSongBySource, insertFingerprints, insertSong, openIndex, refreshHashStats } from "./store";

const USAGE = `
chirp add — index a track from a URL

  bun run tools/ingest/src/add.ts <url>... [options]

  --push             write to the API (D1) instead of the local index
  --db <path>        local index to write (default chirp.sqlite)

Works with anything yt-dlp supports: YouTube, SoundCloud, Bandcamp,
archive.org, Vimeo, Mixcloud, direct audio URLs. Spotify and Apple Music
are DRM-protected and cannot be indexed.
`;

const args = process.argv.slice(2);
const urls = args.filter((a) => !a.startsWith("--") && !/^chirp[\w.-]*\.sqlite$/.test(a));
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1] ?? null;
};

if (urls.length === 0) {
  console.log(USAGE.trim());
  process.exit(1);
}

const push = flag("push");
const dbPath = option("db") ?? "chirp.sqlite";
const db = push ? null : openIndex(dbPath);

const corpusPath = `${ROOT}/corpus.json`;
const corpus: CorpusTrack[] = await Bun.file(corpusPath).json();

let added = 0;

for (const url of urls) {
  try {
    const meta = await resolve(url);
    const label = `${meta.artist} — ${meta.title}`;

    const existing = db
      ? findSongBySource(db, meta.source, meta.source_id, meta.source_url)
      : (await get<{ song: { id: number } | null }>(
          `/api/songs/lookup?source=${encodeURIComponent(meta.source)}` +
            `&id=${encodeURIComponent(meta.source_id)}&url=${encodeURIComponent(meta.source_url)}`,
        )).song;

    if (existing) {
      console.log(`  = ${label}  already indexed as song ${existing.id}`);
      continue;
    }

    const file = await download(url, `${ROOT}/tracks`, `${meta.source}-${meta.source_id}`);
    const pcm = await decode(file);
    const prints = fingerprint(extractPeaks(spectrogram(pcm)));
    const song = { ...meta, frame_count: frameCount(pcm.length) };

    let songId: number;
    if (db) {
      songId = insertSong(db, song);
      insertFingerprints(db, songId, prints);
    } else {
      songId = (await post<{ songId: number }>("/api/songs", song)).songId;
      for (let n = 0; n < prints.length; n += FINGERPRINT_CHUNK) {
        await post(`/api/songs/${songId}/fingerprints`, {
          hashes: prints.slice(n, n + FINGERPRINT_CHUNK).map((p) => [p.hash, p.frame]),
        });
      }
    }

    const relative = file.startsWith(`${ROOT}/`) ? file.slice(ROOT.length + 1) : file;
    const listed = corpus.some((t) => t.source === meta.source && t.source_id === meta.source_id);
    if (!listed) corpus.push({ ...song, ...(await probe(file)), file: relative });
    added++;

    console.log(`  + ${label}  song ${songId}, ${prints.length.toLocaleString()} hashes  [${meta.source}]`);
  } catch (e) {
    console.error(`  ! ${url}\n    ${(e as Error).message}`);
  }
}

if (added > 0) {
  await Bun.write(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`);

  const heavy = db ? refreshHashStats(db) : (await post<{ heavy: number }>("/api/songs/stats", {})).heavy;
  console.log(`\nadded ${added} of ${urls.length}, ${heavy.toLocaleString()} hashes flagged too common`);
} else {
  console.log(`\nnothing added`);
}
