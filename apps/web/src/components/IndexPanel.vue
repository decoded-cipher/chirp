<script setup lang="ts">
import { computed, ref } from "vue";
import type { Song } from "../api";

const props = defineProps<{ songs: Song[] }>();

const query = ref("");
const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.songs;
  return props.songs.filter((s) => `${s.artist} ${s.title}`.toLowerCase().includes(q));
});
</script>

<template>
  <div class="surface overflow-hidden rounded-xl">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
      <span class="font-mono text-xs text-mist-500">{{ shown.length }} of {{ songs.length }} tracks</span>
      <input
        v-model="query" type="search" placeholder="Filter…"
        class="rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm text-mist-50 outline-none transition-colors placeholder:text-mist-500 focus:border-signal-500/60"
      />
    </div>

    <ul class="m-0 max-h-80 list-none overflow-y-auto p-0">
      <li v-for="song in shown" :key="song.id"
          class="flex items-center gap-4 border-b border-ink-800 px-4 py-2.5 text-sm last:border-0">
        <span class="w-44 shrink-0 truncate text-mist-400">{{ song.artist }}</span>
        <span class="min-w-0 flex-1 truncate text-mist-50">{{ song.title }}</span>
      </li>
    </ul>
  </div>
</template>
