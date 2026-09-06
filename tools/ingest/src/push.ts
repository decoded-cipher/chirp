import { extractPeaks, fingerprint, frameCount, spectrogram } from "@chirp/core";
import { FINGERPRINT_CHUNK } from "@chirp/db";
import { loadCorpus, trackPath } from "./corpus";
import { decode } from "./decode";

const api = process.env.CHIRP_API ?? "http://localhost:8787";
const token = process.env.CHIRP_TOKEN ?? "local-dev-token";
const limit = Number(process.argv[2] ?? 6);

const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${api}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const corpus = (await loadCorpus()).slice(0, limit);
const started = performance.now();

for (const [i, track] of corpus.entries()) {
  const pcm = await decode(trackPath(track));
  const prints = fingerprint(extractPeaks(spectrogram(pcm)));

  const { songId } = await post<{ songId: number }>("/api/songs", {
    ...track, frame_count: frameCount(pcm.length),
  });

  for (let n = 0; n < prints.length; n += FINGERPRINT_CHUNK) {
    await post(`/api/songs/${songId}/fingerprints`, {
      hashes: prints.slice(n, n + FINGERPRINT_CHUNK).map((p) => [p.hash, p.frame]),
    });
  }

  console.log(`  [${i + 1}/${corpus.length}] ${track.artist.slice(0, 22).padEnd(24)} song ${songId}  ${prints.length} hashes`);
}

const { pruned } = await post<{ pruned: number }>("/api/songs/prune", {});
console.log(`\npushed ${corpus.length} tracks in ${((performance.now() - started) / 1000).toFixed(1)}s, pruned ${pruned} postings`);
