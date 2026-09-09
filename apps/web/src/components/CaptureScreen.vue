<script setup lang="ts">
import { computed } from "vue";
import type { Song } from "../api";
import { LISTEN, type Live } from "../composables/useLiveIdentify";
import ChirpMark from "./ChirpMark.vue";
import TrackMarquee from "./TrackMarquee.vue";

const props = defineProps<{
  listening: boolean;
  elapsed: number;
  level: number;
  micSupported: boolean;
  songs: Song[];
  live: Live | null;
  rounds: number;
}>();

const emit = defineEmits<{ listen: []; stop: [] }>();

const CIRCUMFERENCE = 2 * Math.PI * 78;

const progress = computed(() => (props.listening ? Math.min(1, props.elapsed / LISTEN.maxSeconds) : 0));
const certainty = computed(() =>
  props.live ? Math.min(1, (props.live.confidence ?? LISTEN.settleMargin) / LISTEN.settleMargin) : 0,
);
</script>

<template>
  <div class="relative flex min-h-dvh flex-col px-5 sm:px-8">
    <div class="pointer-events-none fixed inset-0 bg-[radial-gradient(50rem_36rem_at_50%_56%,rgba(52,227,155,0.13),transparent_70%)]" />

    <header class="relative mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between py-5">
      <div class="flex items-center gap-2.5">
        <ChirpMark :size="26" class="shrink-0 text-signal-500" />
        <span class="text-xl font-extrabold tracking-[-0.03em] text-mist-50">chirp</span>
      </div>
    </header>

    <main class="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center py-2">
      <template v-if="!listening">
        <h1 class="m-0 max-w-3xl text-center text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl">
          Name the song from<br class="hidden sm:inline" /> six seconds of it.
        </h1>
        <p class="m-0 mt-3.5 max-w-xl text-center text-sm leading-relaxed text-mist-400 sm:text-[15px]">
          A spectrogram, constellation peaks, hashed anchor pairs and a vote on time alignment.
          Built from scratch, with no audio libraries and no machine learning.
        </p>
      </template>

      <button
        class="group relative grid size-52 shrink-0 place-items-center rounded-full outline-none disabled:cursor-not-allowed"
        :class="listening ? 'mt-0' : 'mt-6 -my-3 scale-[0.88]'"
        :disabled="!micSupported"
        @click="listening ? emit('stop') : emit('listen')"
      >
        <span v-for="ring in [0, 1, 2]" :key="ring"
              class="absolute rounded-full border border-signal-500/30 transition-all duration-500"
              :class="{ breathe: !listening }"
              :style="{
                inset: `${18 - ring * 6}px`,
                animationDelay: `${ring * 0.6}s`,
                opacity: listening ? 0.9 - ring * 0.25 : 0.35,
                transform: `scale(${listening ? 1 + level * (0.16 + ring * 0.1) : 1})`,
              }" />

        <svg viewBox="0 0 176 176" class="absolute size-44 -rotate-90">
          <circle cx="88" cy="88" r="78" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="2" />
          <circle
            v-if="listening" cx="88" cy="88" r="78" fill="none" stroke="#34e39b" stroke-width="2"
            stroke-linecap="round" :stroke-dasharray="CIRCUMFERENCE"
            :stroke-dashoffset="CIRCUMFERENCE * (1 - progress)"
            class="transition-[stroke-dashoffset] duration-200 ease-linear"
          />
        </svg>

        <span class="relative grid size-32 place-items-center rounded-full border transition-colors"
              :class="listening
                ? 'border-signal-500/70 bg-signal-500/15'
                : 'border-signal-500/25 bg-ink-850 shadow-[0_0_70px_-18px_var(--color-signal-500)] group-hover:border-signal-500/60 group-enabled:group-hover:bg-ink-800'">
          <svg v-if="!listening" viewBox="0 0 24 24" class="size-11 text-mist-50 transition-colors group-hover:text-signal-400"
               fill="none" stroke="currentColor" stroke-width="1.4">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke-linecap="round" />
          </svg>
          <span v-else class="font-mono text-3xl tabular-nums text-signal-400">{{ elapsed.toFixed(1) }}</span>
        </span>
      </button>

      <h2 v-if="listening" class="relative m-0 mt-8 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        Listening…
      </h2>

      <div v-if="listening && live"
           class="rise relative mt-6 w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-850/80 px-5 py-4">
        <p class="m-0 truncate text-sm font-medium">{{ live.title }}</p>
        <p class="m-0 mt-0.5 truncate text-xs text-mist-400">{{ live.artist }}</p>

        <div class="mt-3 h-1 overflow-hidden rounded-full bg-ink-700">
          <div class="h-full rounded-full bg-signal-500 transition-[width] duration-500"
               :style="{ width: `${certainty * 100}%` }" />
        </div>

        <p class="m-0 mt-2 flex justify-between font-mono text-[11px] text-mist-500">
          <span>{{ live.confidence === null ? "∞" : `${live.confidence}×` }} ahead</span>
          <span>{{ live.votes.toLocaleString() }} votes</span>
        </p>
      </div>

      <p v-else class="relative m-0 mt-3 max-w-md text-center text-sm leading-relaxed text-mist-400">
        <template v-if="listening">Hold your device near the sound. Tap again to stop.</template>
        <template v-else-if="!micSupported">This browser has no microphone access.</template>
        <template v-else>Tap to listen. The audio never leaves your browser.</template>
      </p>

      <p v-if="listening && rounds" class="relative m-0 mt-4 font-mono text-[11px] text-mist-500">
        {{ rounds }} {{ rounds === 1 ? "query" : "queries" }} so far
      </p>
    </main>

    <footer v-if="!listening" class="relative shrink-0 pb-6 pt-3">
      <div class="mx-auto w-full max-w-5xl">
        <div v-if="songs.length" class="mb-2.5 flex items-baseline justify-between gap-4">
          <h2 class="m-0 font-mono text-[10px] uppercase tracking-[0.18em] text-mist-500">In the index</h2>
          <span class="font-mono text-[10px] text-mist-500">
            {{ songs.length }} {{ songs.length === 1 ? "track" : "tracks" }} &middot; play one, then tap listen
          </span>
        </div>
      </div>

      <TrackMarquee v-if="songs.length" :songs="songs" class="-mx-5 sm:-mx-8" />
    </footer>
  </div>
</template>
