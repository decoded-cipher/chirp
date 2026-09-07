import { Database } from "bun:sqlite";
import {
  MIN_VOTES, bestPerSong, decide, extractPeaks, fingerprint, mergeTallies, sampleFingerprints,
  spectrogram, type Fingerprint, type Match,
} from "@chirp/core";
import { CARRY_VOTE_FLOOR, MATCH, MAX_POSTINGS_PER_HASH, type MatchRow } from "@chirp/db";
import { decode, loadCorpus, trackPath } from "@chirp/ingest";
import { mixNoise } from "./degrade";

const db = new Database("chirp.sqlite", { readonly: true });
const corpus = await loadCorpus();

const LISTEN = { firstQueryAt: 3, interval: 1.5, maxSeconds: 24, window: 6, settleMargin: 4 };
const TRACKS = 8;
const START = 30;

const pairsOf = (q: readonly Fingerprint[]) => JSON.stringify(q.map((p) => [p.hash, p.frame]));

const KEPT_ROWS = `
WITH q(hash) AS (SELECT json_extract(value,'$[0]') FROM json_each(?1)),
kept AS (SELECT q.hash FROM q LEFT JOIN hash_stats hs ON hs.hash = q.hash
         WHERE COALESCE(hs.postings, 0) <= ?2)
SELECT COUNT(*) n FROM kept JOIN fingerprints f ON f.hash = kept.hash`;

const rowsRead = (q: readonly Fingerprint[]) =>
  q.length === 0 ? 0
    : new Set(q.map((p) => p.hash)).size
      + db.query<{ n: number }, [string, number]>(KEPT_ROWS).get(pairsOf(q), MAX_POSTINGS_PER_HASH)!.n;

const tallyRows = (q: readonly Fingerprint[], floor: number, limit: number): Match[] =>
  db.query<MatchRow, [string, number, number, number]>(MATCH)
    .all(pairsOf(q), MAX_POSTINGS_PER_HASH, floor, limit)
    .map((r) => ({ songId: r.song_id, offsetBucket: r.offset_bucket, votes: r.votes }));

const roundTimes = () => {
  const times: number[] = [];
  for (let t = LISTEN.firstQueryAt; t <= LISTEN.maxSeconds; t += LISTEN.interval) times.push(t);
  return times;
};

const print = (pcm: Float32Array) =>
  sampleFingerprints(fingerprint(extractPeaks(spectrogram(pcm))));

interface Outcome { rows: number; sent: number; rounds: number; found: number | null }

function rolling(clip: Float32Array, rate: number): Outcome {
  let rows = 0;
  let sent = 0;
  let n = 0;

  for (const at of roundTimes()) {
    const from = Math.max(0, at - LISTEN.window);
    const query = print(clip.slice(Math.floor(from * rate), Math.floor(at * rate)));
    rows += rowsRead(query);
    sent += query.length;
    n++;

    const chosen = decide(tallyRows(query, MIN_VOTES, 10));
    if (chosen && chosen.confidence >= LISTEN.settleMargin) {
      return { rows, sent, rounds: n, found: chosen.songId };
    }
  }
  return { rows, sent, rounds: n, found: null };
}

function accumulating(clip: Float32Array, rate: number): Outcome {
  const seen = new Set<number>();
  let carry: Match[] = [];
  let rows = 0;
  let sent = 0;
  let n = 0;

  for (const at of roundTimes()) {
    const whole = print(clip.slice(0, Math.floor(at * rate)));
    const fresh = whole.filter((p) => !seen.has(p.hash * 65536 + p.frame));
    for (const p of fresh) seen.add(p.hash * 65536 + p.frame);
    if (fresh.length === 0) continue;

    rows += rowsRead(fresh);
    sent += fresh.length;
    n++;

    carry = mergeTallies(carry, tallyRows(fresh, CARRY_VOTE_FLOOR, 50));
    const chosen = decide(bestPerSong(carry).filter((m) => m.votes >= MIN_VOTES));
    if (chosen && chosen.confidence >= LISTEN.settleMargin) {
      return { rows, sent, rounds: n, found: chosen.songId };
    }
  }
  return { rows, sent, rounds: n, found: null };
}

for (const [label, snr] of [["clean", null], ["0 dB SNR", 0], ["-6 dB SNR", -6], ["unrecognisable", -30]] as const) {
  const totals = { a: { rows: 0, sent: 0, rounds: 0, hit: 0, wrong: 0 }, b: { rows: 0, sent: 0, rounds: 0, hit: 0, wrong: 0 } };

  for (let i = 0; i < TRACKS; i++) {
    const raw = await decode(trackPath(corpus[i]!), START, LISTEN.maxSeconds);
    const clip = snr === null ? raw : mixNoise(raw, snr, i * 7 + 1);
    const rate = clip.length / LISTEN.maxSeconds;

    for (const [side, run] of [["a", rolling], ["b", accumulating]] as const) {
      const out = run(clip, rate);
      totals[side].rows += out.rows;
      totals[side].sent += out.sent;
      totals[side].rounds += out.rounds;
      if (out.found === i + 1) totals[side].hit++;
      else if (out.found !== null) totals[side].wrong++;
    }
  }

  const line = (name: string, t: typeof totals.a) =>
    `  ${name.padEnd(14)}${`${t.hit}/${TRACKS}`.padStart(6)}` +
    `${(t.rounds / TRACKS).toFixed(1).padStart(9)}` +
    `${String(t.wrong).padStart(8)}` +
    `${Math.round(t.sent / TRACKS).toLocaleString().padStart(10)}` +
    `${Math.round(t.rows / TRACKS).toLocaleString().padStart(13)}`;

  console.log(`\n  ${label} — per listening session, ${TRACKS} tracks`);
  console.log("  strategy       found   rounds   wrong   hashes sent   rows read");
  console.log(line("rolling 6s", totals.a));
  console.log(line("accumulating", totals.b));
  console.log(`  saving${" ".repeat(39)}${(1 - totals.b.rows / totals.a.rows >= 0 ? "" : "")}${
    ((1 - totals.b.rows / totals.a.rows) * 100).toFixed(0)}% fewer rows`);
}
