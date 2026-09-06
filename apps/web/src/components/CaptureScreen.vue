<script setup lang="ts">
import { computed } from "vue";
import { LISTEN, type Live } from "../composables/useLiveIdentify";

const props = defineProps<{
  listening: boolean;
  elapsed: number;
  level: number;
  micSupported: boolean;
  working: string | null;
  indexed: number;
  live: Live | null;
  rounds: number;
}>();

const emit = defineEmits<{ listen: []; stop: []; file: [File] }>();

const CIRCUMFERENCE = 2 * Math.PI * 78;

const progress = computed(() => (props.listening ? Math.min(1, props.elapsed / LISTEN.maxSeconds) : 0));
const certainty = computed(() =>
  props.live ? Math.min(1, (props.live.confidence ?? LISTEN.settleMargin) / LISTEN.settleMargin) : 0,
);

function pick(files: FileList | null | undefined) {
  const file = files?.[0];
  if (file) emit("file", file);
}
</script>

<template>
  <div
    class="relative flex h-dvh flex-col items-center justify-center overflow-hidden px-6"
    @dragover.prevent
    @drop.prevent="pick($event.dataTransfer?.files)"
  >
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_50%_38%,rgba(52,227,155,0.10),transparent_70%)]" />

    <div class="relative flex items-center gap-2.5">
      <span class="size-2 rounded-full bg-signal-500" />
      <span class="font-mono text-xs uppercase tracking-[0.26em] text-signal-500">chirp</span>
    </div>

    <button
      class="group relative mt-12 grid size-52 place-items-center rounded-full outline-none disabled:cursor-not-allowed"
      :disabled="!micSupported || !!working"
      @click="listening ? emit('stop') : emit('listen')"
    >
      <span v-for="ring in [0, 1, 2]" :key="ring"
            class="absolute rounded-full border border-signal-500/25 transition-all duration-500"
            :style="{
              inset: `${18 - ring * 6}px`,
              opacity: listening ? 0.9 - ring * 0.25 : 0.25,
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
              : 'border-ink-600 bg-ink-850 group-hover:border-signal-500/50 group-enabled:group-hover:bg-ink-800'">
        <svg v-if="!listening" viewBox="0 0 24 24" class="size-11 text-mist-200 transition-colors group-hover:text-signal-400"
             fill="none" stroke="currentColor" stroke-width="1.4">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke-linecap="round" />
        </svg>
        <span v-else class="font-mono text-3xl tabular-nums text-signal-400">{{ elapsed.toFixed(1) }}</span>
      </span>
    </button>

    <h1 class="relative m-0 mt-10 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
      {{ listening ? "Listening…" : working ? working : "Play something" }}
    </h1>

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

    <p v-else class="relative m-0 mt-3 max-w-sm text-center text-sm leading-relaxed text-mist-400">
      <template v-if="listening">Hold your device near the sound. Tap again to stop.</template>
      <template v-else-if="working">Fingerprinting happens here, in this tab. Only integers are sent.</template>
      <template v-else-if="!micSupported">
        No microphone available in this browser &mdash; drop an audio file instead.
      </template>
      <template v-else>Tap to listen, or drop an audio file anywhere on this screen.</template>
    </p>

    <label v-if="!listening && !working"
           class="relative mt-9 cursor-pointer rounded-full border border-ink-600 px-5 py-2 text-xs text-mist-400 transition-colors hover:border-signal-500/50 hover:text-mist-50">
      <input type="file" accept="audio/*,video/*" class="hidden"
             @change="pick(($event.target as HTMLInputElement).files)" />
      Choose a file
    </label>

    <p class="absolute bottom-8 font-mono text-[11px] text-mist-500">
      <template v-if="listening && rounds">{{ rounds }} {{ rounds === 1 ? "query" : "queries" }} so far</template>
      <template v-else>{{ indexed }} tracks indexed</template>
    </p>
  </div>
</template>
