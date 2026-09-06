import { ref } from "vue";
import { identify, type IdentifyResponse } from "../api";
import { renderMono } from "../audio/decode";
import type { FingerprintReply } from "../workers/fingerprint.worker";
import { runFingerprint } from "./useFingerprint";
import type { useMicrophone } from "./useMicrophone";

export const LISTEN = {
  window: 6,
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useLiveIdentify(mic: ReturnType<typeof useMicrophone>) {
  const live = ref<Live | null>(null);
  const rounds = ref(0);
  const error = ref<string | null>(null);

  let cancelled = false;

  async function analyseWindow(): Promise<Round> {
    const buffer = mic.recent(Math.min(mic.elapsed.value, LISTEN.window));
    const pcm = await renderMono(buffer);
    const print = await runFingerprint(pcm);

    const started = performance.now();
    const result = await identify(print.hashes);

    return {
      result,
      print,
      pcm,
      telemetry: {
        rate: buffer.sampleRate,
        channels: 1,
        duration: buffer.duration,
        queryMs: performance.now() - started,
      },
    };
  }

  async function run(): Promise<Round | null> {
    cancelled = false;
    live.value = null;
    rounds.value = 0;
    error.value = null;

    let best: Round | null = null;
    let nextAt = LISTEN.firstQueryAt;

    while (!cancelled && mic.elapsed.value < LISTEN.maxSeconds) {
      if (mic.elapsed.value < nextAt) {
        await sleep(120);
        continue;
      }

      let round: Round;
      try {
        round = await analyseWindow();
      } catch (e) {
        // One bad round shouldn't end the session; the next window may carry
        // cleaner audio than the one that failed.
        error.value = (e as Error).message;
        nextAt = mic.elapsed.value + LISTEN.interval;
        continue;
      }

      rounds.value++;
      const match = round.result.match;

      if (match) {
        if (!best || match.votes > best.result.match!.votes) best = round;
        live.value = {
          title: match.title,
          artist: match.artist,
          votes: match.votes,
          confidence: match.confidence,
        };
        if ((match.confidence ?? Infinity) >= LISTEN.settleMargin) return round;
      }

      nextAt = mic.elapsed.value + LISTEN.interval;
    }

    return best;
  }

  return { live, rounds, error, run, cancel: () => { cancelled = true; } };
}
