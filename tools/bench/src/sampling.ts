import { Database } from "bun:sqlite";
import { extractPeaks, fingerprint, sampleFingerprints, spectrogram, type Fingerprint } from "@chirp/core";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";
import { identifyIn } from "@chirp/ingest/store";
import { mixNoise } from "./degrade";

const db = new Database("chirp.sqlite", { readonly: true });
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

const rowsFor = (q: readonly Fingerprint[]) =>
  db.query<{ n: number }, [string]>(`
    WITH q(hash) AS (SELECT json_extract(value,'$[0]') FROM json_each(?1))
    SELECT COUNT(*) n FROM q JOIN fingerprints f ON f.hash = q.hash`)
    .get(JSON.stringify(q.map((p) => [p.hash, p.frame])))!.n;

const STRATEGIES: Record<string, (p: Fingerprint[], n: number) => Fingerprint[]> = {
  stride: (p, n) => sampleFingerprints(p, n),
  "first N": (p, n) => p.slice(0, n),
  random: (p, n) => [...p].sort(() => Math.random() - 0.5).slice(0, n).sort((a, b) => a.frame - b.frame),
};

console.log("strategy    max    sent    clean    0 dB SNR   rows/query");
for (const [name, take] of Object.entries(STRATEGIES)) {
  for (const max of name === "stride" ? [Infinity, 800, 500, 300] : [500]) {
    const cut = (qs: Fingerprint[][]) => qs.map((q) => (max === Infinity ? q : take(q, max)));
    const c = cut(clean);
    const n = cut(noisy);

    const score = (qs: Fingerprint[][]) => qs.filter((q, k) => identifyIn(db, q)?.songId === owner[k]).length;
    const rows = Math.round(c.reduce((a, q) => a + rowsFor(q), 0) / c.length);
    const sent = Math.round(c.reduce((a, q) => a + q.length, 0) / c.length);

    console.log(
      `${name.padEnd(10)}${(max === Infinity ? "none" : String(max)).padStart(6)}` +
        `${String(sent).padStart(8)}` +
        `${`${score(c)}/${c.length}`.padStart(9)}` +
        `${`${score(n)}/${n.length}`.padStart(11)}` +
        `${rows.toLocaleString().padStart(13)}`,
    );
  }
}
