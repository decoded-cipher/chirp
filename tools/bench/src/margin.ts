import { buildIndex, extractPeaks, fingerprint, match, spectrogram, type PeakOptions, type Spectrogram } from "@chirp/core";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";

const E: PeakOptions = {
  bands: [[20, 40], [40, 80], [80, 160], [160, 280], [280, 400], [400, 512]],
  decay: 0.95,
};
const OFFSETS = [12.7, 30, 45, 60.5, 90.5];
const N = 12;

const corpus = (await loadCorpus()).slice(0, N);
const full: Spectrogram[] = [];
const slices: Spectrogram[][] = [];
for (const t of corpus) {
  full.push(spectrogram(await decode(trackPath(t))));
  const s: Spectrogram[] = [];
  for (const at of OFFSETS) s.push(spectrogram(await decode(trackPath(t), at, 6)));
  slices.push(s);
}
const prints = full.map((s) => fingerprint(extractPeaks(s, E)));

const HELD = 3;
const indexed = N - HELD;
const index = buildIndex(prints.slice(0, indexed).map((p, i) => [i, p] as const));

const margin = (r: { votes: number }[]) => (r.length === 0 ? 0 : r[1] ? r[0]!.votes / r[1].votes : Infinity);

const trueM: number[] = [];
const falseM: number[] = [];

for (let i = 0; i < indexed; i++) {
  for (const s of slices[i]!) {
    const r = match(index, fingerprint(extractPeaks(s, E)));
    if (r[0]?.songId === i) trueM.push(margin(r));
  }
}
for (let i = indexed; i < N; i++) {
  for (const s of slices[i]!) falseM.push(margin(match(index, fingerprint(extractPeaks(s, E)))));
}

const sortAsc = (a: number[]) => [...a].sort((x, y) => x - y);
const tm = sortAsc(trueM.filter(Number.isFinite));
const fm = sortAsc(falseM);
console.log(`true  margins (n=${trueM.length}): min ${tm[0]?.toFixed(2)}  p10 ${tm[Math.floor(tm.length * 0.1)]?.toFixed(2)}  median ${tm[Math.floor(tm.length / 2)]?.toFixed(2)}`);
console.log(`false margins (n=${falseM.length}): max ${fm[fm.length - 1]?.toFixed(2)}  p90 ${fm[Math.floor(fm.length * 0.9)]?.toFixed(2)}  median ${fm[Math.floor(fm.length / 2)]?.toFixed(2)}`);

for (const rule of [1.5, 2, 2.5, 3]) {
  const tp = trueM.filter((m) => m >= rule).length;
  const fp = falseM.filter((m) => m >= rule).length;
  console.log(`  margin >= ${rule}x  ->  recall ${tp}/${trueM.length}   falsePos ${fp}/${falseM.length}`);
}
