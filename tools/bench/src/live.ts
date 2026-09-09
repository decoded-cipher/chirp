import { extractPeaks, fingerprint, sampleFingerprints, spectrogram, type Fingerprint } from "@chirp/core";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";
import { mixNoise } from "./degrade";

const API = process.env.CHIRP_API ?? "http://localhost:8787";
const corpus = await loadCorpus();
const OFFSETS = [30, 60.5, 90];
const QUERIED = 12;

const print = (pcm: Float32Array) => sampleFingerprints(fingerprint(extractPeaks(spectrogram(pcm))));

async function identify(q: readonly Fingerprint[], carry?: unknown) {
  const body = carry === undefined
    ? { hashes: q.map((p) => [p.hash, p.frame]) }
    : { hashes: q.map((p) => [p.hash, p.frame]), carry };
  const res = await fetch(`${API}/api/identify`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<any>;
}

console.log("  single-shot\n");
for (const [label, snr] of [["clean", null], ["0 dB SNR", 0]] as const) {
  let hit = 0, wrong = 0, count = 0, points = 0;
  const times: number[] = [];

  for (let i = 0; i < QUERIED; i++) {
    for (const at of OFFSETS) {
      const pcm = await decode(trackPath(corpus[i]!), at, 6);
      const q = print(snr === null ? pcm : mixNoise(pcm, snr, i * 31 + at));
      const t0 = performance.now();
      const r = await identify(q);
      times.push(performance.now() - t0);
      count++;
      points += r.histogram.length;
      if (r.match?.title === corpus[i]!.title) hit++;
      else if (r.match) wrong++;
    }
  }

  const p95 = [...times].sort((a, b) => a - b)[Math.floor(times.length * 0.95)]!;
  console.log(`  ${label.padEnd(9)} ${hit}/${count} correct, ${wrong} wrong  ` +
    `mean ${(times.reduce((s, n) => s + n, 0) / times.length).toFixed(0)}ms p95 ${p95.toFixed(0)}ms  ` +
    `histogram ${Math.round(points / count)} points`);
}

console.log("\n  listening sessions (fresh hashes + carry)\n");
const LISTEN = { firstQueryAt: 3, interval: 1.5, maxSeconds: 24, settleMargin: 4 };
let settled = 0, wrongSessions = 0, sessions = 0, rounds = 0;

for (let i = 0; i < 6; i++) {
  const clip = await decode(trackPath(corpus[i]!), 30, LISTEN.maxSeconds);
  const rate = clip.length / LISTEN.maxSeconds;
  const seen = new Set<number>();
  let carry: unknown[] = [];
  sessions++;

  for (let at = LISTEN.firstQueryAt; at <= LISTEN.maxSeconds; at += LISTEN.interval) {
    const whole = print(clip.slice(0, Math.floor(at * rate)));
    const fresh = whole.filter((p) => !seen.has(p.hash * 65536 + p.frame));
    for (const p of fresh) seen.add(p.hash * 65536 + p.frame);
    if (fresh.length === 0) continue;

    const r = await identify(fresh, carry);
    carry = r.tally;
    rounds++;

    if (r.match && (r.match.confidence ?? Infinity) >= LISTEN.settleMargin) {
      if (r.match.title === corpus[i]!.title) settled++; else wrongSessions++;
      break;
    }
  }
}
console.log(`  ${settled}/${sessions} settled correctly, ${wrongSessions} wrong, ${(rounds / sessions).toFixed(1)} rounds avg`);
