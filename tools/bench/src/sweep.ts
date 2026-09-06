import {
  buildIndex, extractPeaks, fingerprint, match, offsetSeconds, spectrogram,
  type PeakOptions, type Spectrogram,
} from "@chirp/core";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";

const OFFSETS = [12.7, 45, 90.5];
const N = 8;

const corpus = (await loadCorpus()).slice(0, N);
const full: Spectrogram[] = [];
const slices: Spectrogram[][] = [];

process.stdout.write("decoding");
for (const t of corpus) {
  full.push(spectrogram(await decode(trackPath(t))));
  const s: Spectrogram[] = [];
  for (const at of OFFSETS) s.push(spectrogram(await decode(trackPath(t), at, 6)));
  slices.push(s);
  process.stdout.write(".");
}
console.log(" done\n");

const CONFIGS: Record<string, PeakOptions> = {
  "A baseline": {},
  "B coeff 1.3": { thresholdCoeff: 1.3 },
  "C from bin 20": { bands: [[20, 40], [40, 80], [80, 160], [160, 280], [280, 400], [400, 512]] },
  "D decay 0.95": { decay: 0.95 },
  "E from 20 + decay": { bands: [[20, 40], [40, 80], [80, 160], [160, 280], [280, 400], [400, 512]], decay: 0.95 },
  "F wide from 20": { bands: [[20, 50], [50, 110], [110, 240], [240, 512]], decay: 0.95 },
  "G from 10 + decay": { bands: [[10, 25], [25, 55], [55, 110], [110, 220], [220, 360], [360, 512]], decay: 0.95 },
};

console.log("config              hashes/song  uniq%  top1  offErr  margin  falsePos  maxFgn");
for (const [name, opts] of Object.entries(CONFIGS)) {
  const prints = full.map((s) => fingerprint(extractPeaks(s, opts)));
  const index = buildIndex(prints.slice(0, N - 1).map((p, i) => [i, p] as const));

  let hits = 0, tried = 0, errSum = 0, marginSum = 0, marginN = 0;
  for (let i = 0; i < N - 1; i++) {
    for (let k = 0; k < OFFSETS.length; k++) {
      tried++;
      const results = match(index, fingerprint(extractPeaks(slices[i]![k]!, opts)));
      const top = results[0];
      if (top?.songId === i) {
        hits++;
        errSum += Math.abs(offsetSeconds(top.offsetBucket) - OFFSETS[k]!);
        if (results[1]) { marginSum += top.votes / results[1].votes; marginN++; }
      }
    }
  }

  let falsePos = 0, maxFgn = 0;
  for (const s of slices[N - 1]!) {
    const results = match(index, fingerprint(extractPeaks(s, opts)));
    if (results.length) { falsePos++; maxFgn = Math.max(maxFgn, results[0]!.votes); }
  }

  const avgHashes = prints.reduce((a, p) => a + p.length, 0) / prints.length;
  const uniq = prints.reduce((a, p) => a + new Set(p.map((x) => x.hash)).size / Math.max(p.length, 1), 0) / prints.length;
  console.log(
    `${name.padEnd(20)}${String(Math.round(avgHashes)).padStart(8)}` +
    `${(uniq * 100).toFixed(1).padStart(8)}` +
    `${`${hits}/${tried}`.padStart(7)}` +
    `${(hits ? errSum / hits : NaN).toFixed(2).padStart(8)}s` +
    `${(marginN ? marginSum / marginN : 0).toFixed(1).padStart(7)}x` +
    `${`${falsePos}/${OFFSETS.length}`.padStart(10)}` +
    `${String(maxFgn).padStart(8)}`,
  );
}
