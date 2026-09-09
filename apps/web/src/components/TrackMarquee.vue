<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { Song } from "../api";

const props = withDefaults(defineProps<{ songs: Song[]; speed?: number }>(), { speed: 45 });

const frame = ref<HTMLElement>();
const rail = ref<HTMLElement>();
const shift = ref(0);
const copies = ref(2);

const duration = computed(() => Math.max(12, shift.value / props.speed));

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

async function fit() {
  await nextTick();
  const lane = rail.value?.firstElementChild;
  const width = lane?.getBoundingClientRect().width ?? 0;
  const visible = frame.value?.getBoundingClientRect().width ?? 0;
  if (width === 0) return;

  shift.value = width;
  copies.value = Math.max(2, Math.ceil(visible / width) + 1);
}

watch(() => props.songs, fit, { deep: false });
onMounted(() => {
  void fit();
  window.addEventListener("resize", fit);
});
onUnmounted(() => window.removeEventListener("resize", fit));
</script>

<template>
  <div ref="frame" class="group edge-fade overflow-hidden">
    <div
      ref="rail"
      class="marquee flex w-max group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]"
      :style="{ '--marquee-shift': `${shift}px`, '--marquee-duration': `${duration}s` }"
    >
      <ul
        v-for="lane in copies" :key="lane"
        class="m-0 flex shrink-0 list-none gap-2 p-0 pr-2"
        :aria-hidden="lane > 1 ? 'true' : undefined"
      >
        <li v-for="song in songs" :key="song.id">
          <a
            :href="song.source_url ?? '#'" target="_blank" rel="noreferrer"
            :tabindex="lane > 1 ? -1 : undefined"
            class="flex w-64 items-center gap-3 rounded-xl border border-ink-700 bg-ink-850/60 p-2 transition-colors hover:border-signal-500/40 hover:bg-ink-800/70"
          >
            <img
              v-if="song.cover_url" :src="song.cover_url" alt="" loading="lazy"
              class="size-10 shrink-0 rounded-lg object-cover"
            />
            <span v-else class="size-10 shrink-0 rounded-lg bg-ink-700" />

            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-medium text-mist-50">{{ song.title }}</span>
              <span class="block truncate text-[11px] text-mist-400">{{ song.artist }}</span>
            </span>

            <span
              v-if="song.postings"
              class="shrink-0 font-mono text-[10px] tabular-nums text-mist-500"
              :title="`${song.postings.toLocaleString()} fingerprints`"
            >{{ compact(song.postings) }}</span>
          </a>
        </li>
      </ul>
    </div>
  </div>
</template>
