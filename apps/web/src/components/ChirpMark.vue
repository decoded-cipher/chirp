<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 });
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <g transform="translate(32 32) scale(1.09) translate(-27.53 -32)"
       stroke="currentColor" stroke-linecap="round">
      <path d="M48.07 12.85A25 25 0 1 0 48.07 51.15" stroke-width="6.5" />
      <path d="M39.07 23.57A11 11 0 1 0 39.07 40.43" stroke-width="5.5" />
    </g>
  </svg>
</template>
