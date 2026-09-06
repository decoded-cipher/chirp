import { buildIndex, extractPeaks, fingerprint, identify, spectrogram, type FingerprintOptions, type Peak } from "@chirp/core";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";
import { mixNoise } from "./degrade";

const INDEXED = 12;
const QUERIED = 8;
const HELD = [12, 13, 14];
const OFFSETS = [30, 60.5, 90];
const SNR = 0;

const corpus = await loadCorpus();
const peaksOf = (pcm: Float32Array): Peak[] => extractPeaks(spectrogram(pcm));

process.stdout.write("caching peaks");
const indexPeaks: Peak[][] = [];
for (let i = 0; i < INDEXED; i++) {
  indexPeaks.push(peaksOf(await decode(trackPath(corpus[i]!))));
  process.stdout.write(".");
}

const cleanQ: Peak[][] = [];
const noisyQ: Peak[][] = [];
for (let i = 0; i < QUERIED; i++) {
  for (const at of OFFSETS) {
    const pcm = await decode(trackPath(corpus[i]!), at, 6);
    cleanQ.push(peaksOf(pcm));
    noisyQ.push(peaksOf(mixNoise(pcm, SNR, i * 31 + at)));
  }
}
const heldQ: Peak[][] = [];
for (const i of HELD) {
  for (const at of OFFSETS) heldQ.push(peaksOf(await decode(trackPath(corpus[i]!), at, 6)));
}
console.log(" done\n");

const owner = (n: number) => Math.floor(n / OFFSETS.length);

console.log("fanOut  fuzz  hashes/song   clean   0 dB SNR   wrong   falsePos");
for (const fanOut of [5, 8, 12]) {
  for (const freqFuzz of [0, 1, 2]) {
    const opts: FingerprintOptions = { fanOut, freqFuzz };
    const prints = indexPeaks.map((p) => fingerprint(p, opts));
    const index = buildIndex(prints.map((p, i) => [i, p] as const));

    const score = (queries: Peak[][]) => {
      let correct = 0;
      let wrong = 0;
      queries.forEach((q, n) => {
        const r = identify(index, fingerprint(q, opts));
        if (r) (r.songId === owner(n) ? correct++ : wrong++);
      });
      return { correct, wrong };
    };

    const c = score(cleanQ);
    const n = score(noisyQ);
    const fp = heldQ.filter((q) => identify(index, fingerprint(q, opts))).length;
    const avg = Math.round(prints.reduce((a, p) => a + p.length, 0) / prints.length);

    console.log(
      `${String(fanOut).padStart(6)}${String(freqFuzz).padStart(6)}` +
        `${String(avg).padStart(13)}` +
        `${`${c.correct}/${cleanQ.length}`.padStart(8)}` +
        `${`${n.correct}/${noisyQ.length}`.padStart(11)}` +
        `${String(c.wrong + n.wrong).padStart(8)}` +
        `${`${fp}/${heldQ.length}`.padStart(11)}`,
    );
  }
}
