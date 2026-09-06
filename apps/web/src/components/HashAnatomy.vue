<script setup lang="ts">
import { BIN_WIDTH, FRAME_DURATION, unpackHash } from "@chirp/core";
import { computed, ref } from "vue";

const props = defineProps<{ hashes: [number, number][] }>();

const index = ref(0);
const current = computed(() => props.hashes[index.value % Math.max(props.hashes.length, 1)] ?? [0, 0]);
const parts = computed(() => unpackHash(current.value[0]!));

const bits = computed(() =>
  current.value[0]!.toString(2).padStart(24, "0").split("").map((bit, i) => ({
    bit,
    field: i < 9 ? "anchor" : i < 18 ? "target" : "dt",
  })),
);

const FIELD: Record<string, string> = {
  anchor: "bg-signal-500/20 text-signal-300 border-signal-500/35",
  target: "bg-pair-500/20 text-pair-500 border-pair-500/35",
  dt: "bg-warn-500/20 text-warn-500 border-warn-500/35",
};

const hz = (bin: number) => Math.round(bin * BIN_WIDTH);
</script>

<template>
  <div class="flex h-full flex-col justify-between gap-3">
    <div class="flex flex-wrap gap-[2px]">
      <span v-for="(b, i) in bits" :key="i"
            class="flex size-[18px] items-center justify-center rounded-sm border font-mono text-[10px]"
            :class="FIELD[b.field]">{{ b.bit }}</span>
    </div>

    <dl class="m-0 grid grid-cols-3 gap-2">
      <div class="rounded-lg border border-signal-500/25 bg-signal-500/5 p-2">
        <dt class="font-mono text-[9px] uppercase tracking-wide text-signal-300">anchor · 9b</dt>
        <dd class="m-0 mt-1 font-mono text-[11px] text-mist-50">{{ hz(parts.anchor) }} Hz</dd>
      </div>
      <div class="rounded-lg border border-pair-500/25 bg-pair-500/5 p-2">
        <dt class="font-mono text-[9px] uppercase tracking-wide text-pair-500">target · 9b</dt>
        <dd class="m-0 mt-1 font-mono text-[11px] text-mist-50">{{ hz(parts.target) }} Hz</dd>
      </div>
      <div class="rounded-lg border border-warn-500/25 bg-warn-500/5 p-2">
        <dt class="font-mono text-[9px] uppercase tracking-wide text-warn-500">Δt · 6b</dt>
        <dd class="m-0 mt-1 font-mono text-[11px] text-mist-50">
          {{ Math.round(parts.dt * FRAME_DURATION * 1000) }} ms
        </dd>
      </div>
    </dl>

    <div class="flex items-center justify-between gap-3">
      <p class="m-0 text-[11px] leading-snug text-mist-500">
        Two frequencies and the gap between them. The audio cannot be rebuilt from this.
      </p>
      <button class="shrink-0 rounded-md border border-ink-600 px-2.5 py-1 font-mono text-[10px] text-mist-400 transition-colors hover:border-ink-500 hover:text-mist-50"
              @click="index = (index + 1) % Math.max(hashes.length, 1)">next</button>
    </div>
  </div>
</template>
