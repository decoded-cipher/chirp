import { ref } from "vue";
import { identify, type IdentifyResponse, type Tally } from "../api";
import { renderMono } from "../audio/decode";
import type { FingerprintReply } from "../workers/fingerprint.worker";
import { runFingerprint } from "./useFingerprint";
import type { useMicrophone } from "./useMicrophone";

export const LISTEN = {
  window: 24,
  firstQueryAt: 3,
  interval: 1.5,
  maxSeconds: 24,
  settleMargin: 4,
} as const;

export interface Telemetry {
  rate: number;
  channels: number;
  duration: number;
  queryMs: number;
  sentHashes: number;
}

export interface Round {
  result: IdentifyResponse;
  print: FingerprintReply;
  pcm: Float32Array;
  telemetry: Telemetry;
}

export interface Live {
  title: string;
  artist: string;
  votes: number;
  confidence: number | null;
}

interface Session {
  sent: Set<number>;
  histogram: Map<number, number>;
  carry: Tally;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const key = (hash: number, frame: number) => hash * 65536 + frame;

export function useLiveIdentify(mic: ReturnType<typeof useMicrophone>) {
  const live = ref<Live | null>(null);
  const rounds = ref(0);
  const error = ref<string | null>(null);

  let cancelled = false;

  async function analyse(session: Session): Promise<Round | null> {
    const buffer = mic.recent(Math.min(mic.elapsed.value, LISTEN.window));
    const pcm = await renderMono(buffer);
    const print = await runFingerprint(pcm);

    const fresh = print.hashes.filter(([hash, frame]) => !session.sent.has(key(hash, frame)));
    if (fresh.length === 0) return null;
    for (const [hash, frame] of fresh) session.sent.add(key(hash, frame));

    const started = performance.now();
    const result = await identify(fresh, session.carry);
    const queryMs = performance.now() - started;

    session.carry = result.tally;
    for (const point of result.histogram) {
      session.histogram.set(point.seconds, (session.histogram.get(point.seconds) ?? 0) + point.votes);
    }

    return {
      result: {
        ...result,
        histogram: [...session.histogram]
          .map(([seconds, votes]) => ({ seconds, votes }))
          .sort((a, b) => a.seconds - b.seconds),
      },
      print,
      pcm,
      telemetry: {
        rate: buffer.sampleRate,
        channels: 1,
        duration: buffer.duration,
        queryMs,
        sentHashes: fresh.length,
      },
    };
  }

  async function run(): Promise<Round | null> {
    cancelled = false;
    live.value = null;
    rounds.value = 0;
    error.value = null;

    const session: Session = { sent: new Set(), histogram: new Map(), carry: [] };
    let best: Round | null = null;
    let nextAt = LISTEN.firstQueryAt;

    while (!cancelled && mic.elapsed.value < LISTEN.maxSeconds) {
      if (mic.elapsed.value < nextAt) {
        await sleep(120);
        continue;
      }

      let round: Round | null;
      try {
        round = await analyse(session);
      } catch (e) {
        // The next window may carry cleaner audio than the one that failed.
        error.value = (e as Error).message;
        nextAt = mic.elapsed.value + LISTEN.interval;
        continue;
      }

      nextAt = mic.elapsed.value + LISTEN.interval;
      if (!round) continue;

      rounds.value++;
      const match = round.result.match;

      if (match) {
        best = round;
        live.value = {
          title: match.title,
          artist: match.artist,
          votes: match.votes,
          confidence: match.confidence,
        };
        if ((match.confidence ?? Infinity) >= LISTEN.settleMargin) return round;
      }
    }

    return best;
  }

  return { live, rounds, error, run, cancel: () => { cancelled = true; } };
}
