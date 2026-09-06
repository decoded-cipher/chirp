<script setup lang="ts">
defineProps<{ label: string; hint?: string; accent?: boolean }>();
</script>

<template>
  <section
    class="rise relative flex min-h-0 flex-col overflow-hidden rounded-2xl border transition-colors"
    :class="accent
      ? 'border-signal-500/30 bg-gradient-to-br from-signal-500/10 via-ink-850 to-ink-900'
      : 'border-ink-700 bg-ink-850/70'"
  >
    <header class="flex shrink-0 items-baseline justify-between gap-3 px-4 pt-3.5 pb-2">
      <span class="font-mono text-[10px] uppercase tracking-[0.16em]"
            :class="accent ? 'text-signal-500' : 'text-mist-500'">{{ label }}</span>
      <span v-if="hint" class="truncate font-mono text-[10px] text-mist-500">{{ hint }}</span>
      <slot name="action" />
    </header>
    <div class="min-h-0 flex-1 overflow-hidden px-4 pb-4">
      <slot />
    </div>
  </section>
</template>
