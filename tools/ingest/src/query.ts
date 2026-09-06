import { extractPeaks, fingerprint, sampleFingerprints, spectrogram } from "@chirp/core";
import { loadCorpus, trackPath } from "./corpus";
import { decode } from "./decode";

interface IdentifyResponse {
  match: null | {
    id: number; title: string; artist: string; attribution: string | null;
    votes: number; confidence: number | null; offsetSeconds: number;
  };
  candidates?: number;
}

const api = process.env.CHIRP_API ?? "http://localhost:8787";

export async function identifyVia(path: string, at: number, duration = 6) {
  const prints = sampleFingerprints(fingerprint(extractPeaks(spectrogram(await decode(path, at, duration)))));
  const started = performance.now();

  const res = await fetch(`${api}/api/identify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hashes: prints.map((p) => [p.hash, p.frame]) }),
  });
  if (!res.ok) throw new Error(`identify -> ${res.status} ${await res.text()}`);

  return { ...((await res.json()) as IdentifyResponse), ms: performance.now() - started, sent: prints.length };
}

if (import.meta.main) {
  const corpus = await loadCorpus();

  console.log("indexed tracks:");
  for (const i of [0, 2, 5]) {
    for (const at of [30, 75.5]) {
      const r = await identifyVia(trackPath(corpus[i]!), at);
      console.log(
        `  song ${i + 1} @${String(at).padStart(5)}s -> ` +
          (r.match
            ? `${String(r.match.id).padStart(2)} ${r.match.artist.slice(0, 18).padEnd(20)} ` +
              `@${r.match.offsetSeconds.toFixed(2)}s  ${String(r.match.votes).padStart(4)}v  ` +
              `${r.match.confidence ?? "inf"}x  ${r.ms.toFixed(0)}ms`
            : `no match (${r.candidates} candidates)`),
      );
    }
  }

  console.log("\nun-indexed tracks (should refuse):");
  for (const i of [10, 15, 20]) {
    const r = await identifyVia(trackPath(corpus[i]!), 45);
    console.log(
      `  ${corpus[i]!.artist.slice(0, 22).padEnd(24)} -> ` +
        (r.match ? `WRONG: matched song ${r.match.id}` : `no match (${r.candidates} candidates)`),
    );
  }
}
