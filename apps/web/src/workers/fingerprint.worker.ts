import {
  FAN_OUT, FFT_BINS, TARGET_ZONE_MAX, TARGET_ZONE_MIN,
  extractPeaks, fingerprint, sampleFingerprints, spectrogram, type Peak,
} from "@chirp/core";

export interface SpectrogramImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export interface HashPair {
  anchor: Peak;
  target: Peak;
}

export interface FingerprintRequest {
  pcm: Float32Array;
}

export interface Envelope {
  min: Float32Array;
  max: Float32Array;
}

export interface FingerprintReply {
  envelope: Envelope;
  hashes: [number, number][];
  frames: number;
  totalPeaks: number;
  totalHashes: number;
  ms: number;
  image: SpectrogramImage;
  peaks: Peak[];
  pairs: HashPair[];
}

const MAX_COLUMNS = 900;
const ROWS = 256;
const DYNAMIC_RANGE_DB = 75;
const MAX_PLOTTED_PEAKS = 6000;
const PLOTTED_PAIRS = 60;
const ENVELOPE_COLUMNS = 1400;

function envelope(pcm: Float32Array): Envelope {
  const columns = Math.min(ENVELOPE_COLUMNS, pcm.length);
  const per = pcm.length / columns;
  const min = new Float32Array(columns);
  const max = new Float32Array(columns);

  for (let x = 0; x < columns; x++) {
    const from = Math.floor(x * per);
    const to = Math.max(from + 1, Math.floor((x + 1) * per));
    let lo = 1;
    let hi = -1;
    for (let i = from; i < to; i++) {
      const v = pcm[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[x] = lo;
    max[x] = hi;
  }

  return { min, max };
}

function render(power: Float32Array, frames: number): SpectrogramImage {
  const width = Math.min(frames, MAX_COLUMNS);
  const columns = frames / width;
  const binsPerRow = (FFT_BINS - 1) / ROWS;
  const pixels = new Uint8Array(width * ROWS);

  let loudest = 1e-12;
  for (const p of power) if (p > loudest) loudest = p;
  const floor = Math.log10(loudest) - DYNAMIC_RANGE_DB / 10;
  const scale = 255 / (Math.log10(loudest) - floor);

  for (let x = 0; x < width; x++) {
    const from = Math.floor(x * columns);
    const to = Math.max(from + 1, Math.floor((x + 1) * columns));

    for (let y = 0; y < ROWS; y++) {
      const lo = Math.floor(y * binsPerRow);
      const hi = Math.max(lo + 1, Math.floor((y + 1) * binsPerRow));

      let peak = 0;
      for (let f = from; f < to; f++) {
        const base = f * FFT_BINS;
        for (let b = lo; b < hi; b++) {
          const v = power[base + b]!;
          if (v > peak) peak = v;
        }
      }
      // Rows run top-down while bins run bottom-up, so high frequencies land first.
      pixels[(ROWS - 1 - y) * width + x] = peak <= 0 ? 0 : Math.max(0, Math.min(255, (Math.log10(peak) - floor) * scale));
    }
  }

  return { width, height: ROWS, pixels };
}

function samplePairs(peaks: readonly Peak[]): HashPair[] {
  const pairs: HashPair[] = [];
  const stride = Math.max(1, Math.floor(peaks.length / PLOTTED_PAIRS));

  for (let i = 0; i < peaks.length && pairs.length < PLOTTED_PAIRS; i += stride) {
    const anchor = peaks[i]!;
    let taken = 0;
    for (let j = i + 1; j < peaks.length && taken < FAN_OUT; j++) {
      const target = peaks[j]!;
      const dt = target.frame - anchor.frame;
      if (dt < TARGET_ZONE_MIN) continue;
      if (dt > TARGET_ZONE_MAX) break;
      pairs.push({ anchor, target });
      taken++;
      break;
    }
  }

  return pairs;
}

self.onmessage = (event: MessageEvent<FingerprintRequest>) => {
  const started = performance.now();
  const spec = spectrogram(event.data.pcm);
  const peaks = extractPeaks(spec);
  const prints = fingerprint(peaks);
  const sampled = sampleFingerprints(prints);

  const stride = Math.max(1, Math.ceil(peaks.length / MAX_PLOTTED_PEAKS));
  const reply: FingerprintReply = {
    envelope: envelope(event.data.pcm),
    hashes: sampled.map((p) => [p.hash, p.frame]),
    frames: spec.frames,
    totalPeaks: peaks.length,
    totalHashes: prints.length,
    ms: performance.now() - started,
    image: render(spec.power, spec.frames),
    peaks: peaks.filter((_, i) => i % stride === 0),
    pairs: samplePairs(peaks),
  };

  self.postMessage(reply, [reply.image.pixels.buffer, reply.envelope.min.buffer, reply.envelope.max.buffer]);
};
