<script setup lang="ts">
import { ref, watch } from "vue";
import { identify } from "../api";
import { mixNoise } from "../audio/noise";
import { runFingerprint } from "../composables/useFingerprint";

const props = defineProps<{ pcm: Float32Array; expected: number }>();

interface Trial {
  snr: number;
  songId: number | null;
  confidence: number | null;
  votes: number;
  correct: boolean;
}

const snr = ref(20);
const busy = ref(false);
const trial = ref<Trial | null>(null);
const history = ref<Map<number, Trial>>(new Map());

let token = 0;

async function evaluate() {
  const mine = ++token;
  busy.value = true;

  try {
    const noisy = mixNoise(props.pcm, snr.value, 7);
    const printed = await runFingerprint(noisy);
    const response = await identify(printed.hashes);
    if (mine !== token) return;

    const result: Trial = {
      snr: snr.value,
      songId: response.match?.id ?? null,
      confidence: response.match?.confidence ?? null,
      votes: response.match?.votes ?? 0,
      correct: response.match?.id === props.expected,
    };
    trial.value = result;
    history.value.set(snr.value, result);
    history.value = new Map(history.value);
  } finally {
    if (mine === token) busy.value = false;
  }
}

let timer: ReturnType<typeof setTimeout>;
watch(snr, () => {
  clearTimeout(timer);
  timer = setTimeout(evaluate, 260);
});

evaluate();

const LEVELS = [20, 15, 10, 5, 0, -5, -10];
</script>

<template>
  <div class="flex h-full flex-col justify-between gap-3">
    <div class="flex items-end justify-between gap-3">
      <p class="m-0 max-w-[16rem] text-[11px] leading-snug text-mist-500">
        Mixes white noise into your audio and runs the whole pipeline again.
      </p>
      <p class="m-0 font-mono text-2xl leading-none tabular-nums"
         :class="snr >= 5 ? 'text-signal-500' : snr >= 0 ? 'text-warn-500' : 'text-fail-500'">
        {{ snr > 0 ? "+" : "" }}{{ snr }}<span class="ml-1 text-xs text-mist-500">dB</span>
      </p>
    </div>

    <input v-model.number="snr" type="range" min="-10" max="20" step="1" class="w-full accent-signal-500" />

    <div class="flex items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2">
      <template v-if="busy">
        <span class="size-1.5 animate-pulse rounded-full bg-mist-500" />
        <span class="text-xs text-mist-400">Re-identifying…</span>
      </template>
      <template v-else-if="trial">
        <span class="size-1.5 shrink-0 rounded-full" :class="trial.correct ? 'bg-signal-500' : 'bg-fail-500'" />
        <span class="text-xs" :class="trial.correct ? 'text-mist-50' : 'text-fail-500'">
          {{ trial.correct ? "Still identified" : trial.songId ? "Wrong track" : "Refused to guess" }}
        </span>
        <span v-if="trial.songId" class="ml-auto font-mono text-[10px] text-mist-500">
          {{ trial.votes }}v · {{ trial.confidence ?? "∞" }}×
        </span>
      </template>
    </div>

    <div class="flex flex-wrap gap-1">
      <button v-for="level in LEVELS" :key="level"
              class="rounded border px-2 py-0.5 font-mono text-[10px] transition-colors"
              :class="[
                snr === level ? 'border-signal-500/50 bg-signal-500/10 text-signal-400' : 'border-ink-600 text-mist-500 hover:border-ink-500',
                history.get(level) && !history.get(level)!.correct ? 'line-through decoration-fail-500' : '',
              ]"
              @click="snr = level">{{ level > 0 ? "+" : "" }}{{ level }}</button>
    </div>
  </div>
</template>
