<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { Envelope } from "../workers/fingerprint.worker";

const props = defineProps<{ envelope: Envelope }>();

const canvas = ref<HTMLCanvasElement>();
const HEIGHT = 96;

function draw() {
  const el = canvas.value;
  if (!el) return;

  const width = el.clientWidth;
  const dpr = window.devicePixelRatio || 1;
  el.width = width * dpr;
  el.height = HEIGHT * dpr;

  const ctx = el.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, HEIGHT);

  const { min, max } = props.envelope;
  const mid = HEIGHT / 2;
  const step = width / min.length;

  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "rgba(52,227,155,0.85)");
  gradient.addColorStop(0.5, "rgba(52,227,155,0.55)");
  gradient.addColorStop(1, "rgba(52,227,155,0.85)");
  ctx.fillStyle = gradient;

  for (let i = 0; i < min.length; i++) {
    const top = mid - max[i]! * mid;
    const bottom = mid - min[i]! * mid;
    ctx.fillRect(i * step, top, Math.max(step * 0.8, 0.6), Math.max(bottom - top, 0.8));
  }
}

onMounted(() => {
  draw();
  window.addEventListener("resize", draw);
});
watch(() => props.envelope, draw);
</script>

<template>
  <canvas ref="canvas" class="block w-full" :style="{ height: `${HEIGHT}px` }" />
</template>
