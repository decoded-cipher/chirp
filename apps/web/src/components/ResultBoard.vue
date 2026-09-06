<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import type { IdentifyResponse } from "../api";
import type { FingerprintReply } from "../workers/fingerprint.worker";
import BentoTile from "./BentoTile.vue";
import HashAnatomy from "./HashAnatomy.vue";
import SpectrogramView from "./SpectrogramView.vue";
import WaveformView from "./WaveformView.vue";

const AlignmentChart = defineAsyncComponent(() => import("./AlignmentChart.vue"));
const CandidateBars = defineAsyncComponent(() => import("./CandidateBars.vue"));
const NoiseLab = defineAsyncComponent(() => import("./NoiseLab.vue"));

const props = defineProps<{
  result: IdentifyResponse;
  print: FingerprintReply;
  pcm: Float32Array | null;
  telemetry: { rate: number; channels: number; duration: number; queryMs: number };
  indexed: number;
}>();

defineEmits<{ again: [] }>();

const match = computed(() => props.result.match);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const album = computed(() => {
  const m = props.result.match;
  return m?.album && m.album !== m.artist && m.album !== m.title ? m.album : null;
});
</script>

<template>
  <div class="min-h-dvh px-4 pb-6 pt-4 sm:px-6">
    <header class="mb-4 flex items-center justify-between gap-4">
      <div class="flex items-center gap-2.5">
        <span class="size-2 rounded-full bg-signal-500" />
        <span class="font-mono text-xs uppercase tracking-[0.24em] text-signal-500">chirp</span>
      </div>
      <button
        class="flex items-center gap-2 rounded-full border border-ink-600 px-4 py-1.5 text-xs text-mist-300 transition-colors hover:border-signal-500/50 hover:text-mist-50"
        @click="$emit('again')"
      >
        <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.6">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke-linecap="round" />
        </svg>
        New capture
      </button>
    </header>

    <div class="grid auto-rows-min grid-cols-1 gap-3 lg:grid-cols-12">
      <BentoTile :label="match ? 'Identified' : 'No confident match'" :accent="!!match"
                 class="lg:col-span-5">
        <template v-if="match">
          <h2 class="m-0 truncate text-2xl font-semibold tracking-tight">{{ match.title }}</h2>
          <p class="m-0 mt-1 truncate text-sm text-mist-400">
            {{ match.artist }}<span v-if="album"> &middot; {{ album }}</span>
          </p>

          <div class="mt-5 flex items-end gap-6">
            <div>
              <p class="m-0 font-mono text-3xl leading-none tabular-nums text-signal-400">
                {{ match.confidence === null ? "∞" : `${match.confidence}×` }}
              </p>
              <p class="m-0 mt-1.5 text-[10px] text-mist-500">ahead of runner-up</p>
            </div>
            <div>
              <p class="m-0 font-mono text-3xl leading-none tabular-nums">{{ clock(match.offsetSeconds) }}</p>
              <p class="m-0 mt-1.5 text-[10px] text-mist-500">position in track</p>
            </div>
            <div>
              <p class="m-0 font-mono text-3xl leading-none tabular-nums">{{ match.votes.toLocaleString() }}</p>
              <p class="m-0 mt-1.5 text-[10px] text-mist-500">agreeing hashes</p>
            </div>
          </div>

          <p v-if="match.attribution" class="m-0 mt-5 border-t border-ink-700 pt-3 text-[11px] leading-snug text-mist-500">
            {{ match.attribution }}
          </p>
        </template>

        <template v-else>
          <p class="m-0 text-sm leading-relaxed text-mist-200">
            {{ result.candidates.length }} candidates were scored and none pulled clearly ahead.
            A guess would be worse than silence, so it declines.
          </p>
          <p class="m-0 mt-4 text-[11px] text-mist-500">
            Try recording closer to the source, or for longer.
          </p>
        </template>
      </BentoTile>

      <BentoTile v-if="match" label="Time alignment" class="lg:col-span-7"
                 hint="every offset the snippet could sit at">
        <AlignmentChart :points="result.histogram" :peak-seconds="match.offsetSeconds"
                        :duration="match.duration_s" />
      </BentoTile>

      <BentoTile label="Spectrogram" class="lg:col-span-7"
                 :hint="`${print.frames.toLocaleString()} frames · ${print.totalPeaks.toLocaleString()} peaks kept`">
        <SpectrogramView :print="print" />
      </BentoTile>

      <BentoTile label="Anatomy of a hash" class="lg:col-span-5" hint="24 bits">
        <HashAnatomy :hashes="print.hashes" />
      </BentoTile>

      <BentoTile v-if="match && pcm" label="Noise tolerance" class="lg:col-span-5" hint="live benchmark">
        <NoiseLab :pcm="pcm" :expected="match.id" />
      </BentoTile>

      <BentoTile v-if="match" label="Candidates" class="lg:col-span-4" hint="votes per track">
        <CandidateBars :candidates="result.candidates" :winner="match.id" />
      </BentoTile>

      <BentoTile label="Capture" class="lg:col-span-3"
                 :hint="`${telemetry.rate / 1000} kHz · ${telemetry.channels}ch`">
        <div class="flex h-full flex-col justify-between gap-3">
          <div class="rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5">
            <WaveformView :envelope="print.envelope" />
          </div>
          <dl class="m-0 grid grid-cols-2 gap-x-3 gap-y-2">
            <div v-for="item in [
              { k: 'Length', v: `${telemetry.duration.toFixed(1)}s` },
              { k: 'Hashes', v: print.hashes.length.toLocaleString() },
              { k: 'Fingerprint', v: `${print.ms.toFixed(0)} ms` },
              { k: 'Query', v: `${telemetry.queryMs.toFixed(0)} ms` },
            ]" :key="item.k">
              <dt class="font-mono text-[9px] uppercase tracking-wider text-mist-500">{{ item.k }}</dt>
              <dd class="m-0 font-mono text-xs tabular-nums text-mist-200">{{ item.v }}</dd>
            </div>
          </dl>
        </div>
      </BentoTile>
    </div>
  </div>
</template>
