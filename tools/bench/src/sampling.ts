import { extractPeaks, fingerprint, sampleFingerprints, spectrogram, type Fingerprint } from "@chirp/core";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";
import { connect, identifyIn } from "@chirp/db";
import { mixNoise } from "./degrade";

const db = connect(process.env.PG_URL ?? "postgres://chirp:chirp@localhost:55432/chirp");
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

const STRATEGIES: Record<string, (p: Fingerprint[], n: number) => Fingerprint[]> = {
  stride: (p, n) => sampleFingerprints(p, n),
  "first N": (p, n) => p.slice(0, n),
  random: (p, n) => [...p].sort(() => Math.random() - 0.5).slice(0, n).sort((a, b) => a.frame - b.frame),
};

console.log("strategy    max    sent    clean    0 dB SNR   latency");
for (const [name, take] of Object.entries(STRATEGIES)) {
  for (const max of name === "stride" ? [Infinity, 800, 500, 300] : [500]) {
    const cut = (qs: Fingerprint[][]) => qs.map((q) => (max === Infinity ? q : take(q, max)));
    const c = cut(clean);
    const n = cut(noisy);

    const score = async (qs: Fingerprint[][]) => {
      let hit = 0;
      for (const [k, q] of qs.entries()) if ((await identifyIn(db, q))?.songId === owner[k]) hit++;
      return hit;
    };
    const sent = Math.round(c.reduce((a, q) => a + q.length, 0) / c.length);

    const started = performance.now();
    const hitClean = await score(c);
    const latency = (performance.now() - started) / c.length;
    const hitNoisy = await score(n);

    console.log(
      `${name.padEnd(10)}${(max === Infinity ? "none" : String(max)).padStart(6)}` +
        `${String(sent).padStart(8)}` +
        `${`${hitClean}/${c.length}`.padStart(9)}` +
        `${`${hitNoisy}/${n.length}`.padStart(11)}` +
        `${`${latency.toFixed(0)}ms`.padStart(9)}`,
    );
  }
}
await db.end();
