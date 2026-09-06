<script setup lang="ts">
import { BANDS, FFT_BINS } from "@chirp/core";
import { onMounted, ref, watch } from "vue";
import type { FingerprintReply } from "../workers/fingerprint.worker";

const props = defineProps<{ print: FingerprintReply }>();

const layers = ref({ peaks: true, pairs: false, bands: false });
const canvas = ref<HTMLCanvasElement>();
const HEIGHT = 210;
const MAX_BIN = FFT_BINS - 1;

function colour(v: number): [number, number, number] {
  const t = v / 255;
  return [
    Math.round(255 * Math.min(1, Math.max(0, -0.2 + 2.3 * t))),
    Math.round(255 * Math.min(1, Math.max(0, -0.45 + 1.75 * t))),
    Math.round(255 * Math.min(1, Math.max(0, 0.32 + 1.3 * t - 2.2 * t * t + 1.0 * t ** 3))),
  ];
}

function draw() {
  const el = canvas.value;
  if (!el) return;

  const { image, peaks, pairs, frames } = props.print;
  const width = el.clientWidth;
  const dpr = window.devicePixelRatio || 1;
  el.width = width * dpr;
  el.height = HEIGHT * dpr;

  const ctx = el.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const buffer = document.createElement("canvas");
  buffer.width = image.width;
  buffer.height = image.height;
  const bctx = buffer.getContext("2d")!;
  const data = bctx.createImageData(image.width, image.height);
  for (let i = 0; i < image.pixels.length; i++) {
    const [r, g, b] = colour(image.pixels[i]!);
    data.data[i * 4] = r;
    data.data[i * 4 + 1] = g;
    data.data[i * 4 + 2] = b;
    data.data[i * 4 + 3] = 255;
  }
  bctx.putImageData(data, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buffer, 0, 0, width, HEIGHT);

  const x = (frame: number) => (frame / Math.max(frames, 1)) * width;
  const y = (bin: number) => (1 - bin / MAX_BIN) * HEIGHT;

  if (layers.value.bands) {
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.setLineDash([4, 4]);
    for (const [lo] of BANDS) {
      ctx.beginPath();
      ctx.moveTo(0, y(lo));
      ctx.lineTo(width, y(lo));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  if (layers.value.pairs) {
    ctx.strokeStyle = "rgba(74,168,255,0.8)";
    for (const { anchor, target } of pairs) {
      ctx.beginPath();
      ctx.moveTo(x(anchor.frame), y(anchor.bin));
      ctx.lineTo(x(target.frame), y(target.bin));
      ctx.stroke();
    }
  }

  if (layers.value.peaks) {
    ctx.fillStyle = "rgba(52,227,155,0.95)";
    const r = peaks.length > 3000 ? 0.7 : 1.5;
    for (const peak of peaks) {
      ctx.beginPath();
      ctx.arc(x(peak.frame), y(peak.bin), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

onMounted(() => {
  draw();
  window.addEventListener("resize", draw);
});
watch([() => props.print, layers], draw, { deep: true });

const toggles = [
  { key: "peaks" as const, label: "Peaks", dot: "bg-signal-500" },
  { key: "pairs" as const, label: "Pairs", dot: "bg-pair-500" },
  { key: "bands" as const, label: "Bands", dot: "bg-mist-200" },
];
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-2">
    <div class="flex shrink-0 flex-wrap gap-1.5">
      <button
        v-for="t in toggles" :key="t.key"
        class="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] transition-colors"
        :class="layers[t.key] ? 'bg-ink-600 text-mist-50' : 'text-mist-500 hover:bg-ink-700'"
        @click="layers[t.key] = !layers[t.key]"
      >
        <span class="size-1.5 rounded-full" :class="layers[t.key] ? t.dot : 'bg-ink-500'" />
        {{ t.label }}
      </button>
    </div>

    <div class="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-ink-700">
      <canvas ref="canvas" class="block w-full" :style="{ height: `${HEIGHT}px` }" />
      <span class="pointer-events-none absolute left-2 top-1.5 font-mono text-[10px] text-white/50">5.5 kHz</span>
      <span class="pointer-events-none absolute bottom-1.5 left-2 font-mono text-[10px] text-white/50">0 Hz</span>
    </div>
  </div>
</template>
