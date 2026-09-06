<script setup lang="ts">
import type { ApexOptions } from "apexcharts";
import { computed } from "vue";

const props = defineProps<{
  points: { seconds: number; votes: number }[];
  peakSeconds: number;
  duration: number | null;
}>();

const RESOLUTION = 700;
const span = computed(() => Math.max(props.duration ?? 0, props.points.at(-1)?.seconds ?? 0, 1));

// Buckets keep the maximum, never the mean: averaging to the display width would
// flatten the single-bucket spike this chart exists to show.
const series = computed(() => {
  const buckets = new Float64Array(RESOLUTION);
  for (const { seconds, votes } of props.points) {
    const i = Math.min(RESOLUTION - 1, Math.floor((seconds / span.value) * RESOLUTION));
    buckets[i] = Math.max(buckets[i]!, votes);
  }
  const step = span.value / RESOLUTION;
  return [{ name: "Agreeing hashes", data: Array.from(buckets, (v, i) => [i * step, v]) }];
});

const peak = computed(() => Math.max(...series.value[0]!.data.map((d) => d[1] as number), 0));
const floorVotes = computed(() => {
  const rest = series.value[0]!.data
    .filter((d) => (d[1] as number) > 0 && Math.abs((d[0] as number) - props.peakSeconds) > 2)
    .map((d) => d[1] as number)
    .sort((a, b) => a - b);
  return rest.length ? Math.round(rest[Math.floor(rest.length / 2)]!) : 0;
});

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const options = computed<ApexOptions>(() => ({
  chart: { type: "area", height: 200, background: "transparent", toolbar: { show: false }, zoom: { enabled: false }, fontFamily: "inherit" },
  theme: { mode: "dark" },
  dataLabels: { enabled: false },
  stroke: { curve: "straight", width: 1.5 },
  colors: ["#34e39b"],
  fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.02, stops: [0, 90, 100] } },
  grid: { borderColor: "rgba(255,255,255,0.05)", strokeDashArray: 3, padding: { left: 12, right: 12 } },
  xaxis: {
    type: "numeric", min: 0, max: span.value, tickAmount: 8,
    labels: { formatter: (v: string) => clock(Number(v)), style: { colors: "#6b7488" } },
    axisBorder: { show: false }, axisTicks: { show: false },
  },
  yaxis: { labels: { formatter: (v: number) => String(Math.round(v)), style: { colors: "#6b7488" } } },
  annotations: {
    xaxis: [{
      x: props.peakSeconds, borderColor: "#34e39b", strokeDashArray: 4,
      label: { text: clock(props.peakSeconds), borderColor: "#34e39b", style: { background: "#34e39b", color: "#07080b", fontSize: "11px" } },
    }],
  },
  tooltip: { theme: "dark", x: { formatter: (v: number) => clock(v) }, y: { formatter: (v: number) => `${v} hashes agree` } },
}));
</script>

<template>
  <div class="flex h-full flex-col">
    <apexchart type="area" height="200" :options="options" :series="series" />
    <p class="m-0 text-center text-[11px] text-mist-500">
      <span class="text-signal-500">{{ peak }}</span> votes at the match &middot; {{ floorVotes }} everywhere else
    </p>
  </div>
</template>
