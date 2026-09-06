import { buildIndex, extractPeaks, fingerprint, identify, spectrogram } from "@chirp/core";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";
import { filtered, mixNoise, recompressed } from "./degrade";

const INDEXED = 12;
const QUERIED = 8;
const OFFSETS = [30, 60.5, 90];
const DURATION = 6;

const corpus = (await loadCorpus()).slice(0, INDEXED);
const prints = (pcm: Float32Array) => fingerprint(extractPeaks(spectrogram(pcm)));

process.stdout.write("indexing");
const index = buildIndex(
  await Promise.all(
    corpus.map(async (t, i) => {
      const p = [i, prints(await decode(trackPath(t)))] as const;
      process.stdout.write(".");
      return p;
    }),
  ),
);
console.log("");

const clean = new Map<string, Float32Array>();
for (let i = 0; i < QUERIED; i++) {
  for (const at of OFFSETS) {
    clean.set(`${i}:${at}`, await decode(trackPath(corpus[i]!), at, DURATION));
  }
}

type Variant = { name: string; make: (i: number, at: number) => Promise<Float32Array> };

const VARIANTS: Variant[] = [
  { name: "clean", make: async (i, at) => clean.get(`${i}:${at}`)! },
  ...[20, 15, 10, 5, 0, -5].map((snr) => ({
    name: `noise ${snr > 0 ? "+" : ""}${snr} dB SNR`,
    make: async (i: number, at: number) => mixNoise(clean.get(`${i}:${at}`)!, snr, i * 31 + at),
  })),
  ...["96k", "64k", "32k"].map((b) => ({
    name: `mp3 ${b}`,
    make: (i: number, at: number) => recompressed(trackPath(corpus[i]!), at, DURATION, b),
  })),
  { name: "lowpass 3.5k", make: (i, at) => filtered(trackPath(corpus[i]!), at, DURATION, "lowpass=f=3500") },
  {
    name: "phone band",
    make: (i, at) => filtered(trackPath(corpus[i]!), at, DURATION, "highpass=f=300,lowpass=f=3400"),
  },
];

console.log(`\n${INDEXED} indexed, ${QUERIED} queried x ${OFFSETS.length} offsets = ${QUERIED * OFFSETS.length} queries\n`);
console.log("degradation           correct    wrong     miss");

for (const variant of VARIANTS) {
  let correct = 0;
  let wrong = 0;
  let miss = 0;

  for (let i = 0; i < QUERIED; i++) {
    for (const at of OFFSETS) {
      const result = identify(index, prints(await variant.make(i, at)));
      if (!result) miss++;
      else if (result.songId === i) correct++;
      else wrong++;
    }
  }

  const total = QUERIED * OFFSETS.length;
  console.log(
    `${variant.name.padEnd(20)}` +
      `${`${correct}/${total}`.padStart(8)}` +
      `${((correct / total) * 100).toFixed(0).padStart(4)}%` +
      `${String(wrong).padStart(8)}` +
      `${String(miss).padStart(9)}`,
  );
}
