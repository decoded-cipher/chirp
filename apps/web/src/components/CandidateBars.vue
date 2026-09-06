<script setup lang="ts">
import type { ApexOptions } from "apexcharts";
import { computed } from "vue";
import type { Candidate } from "../api";

const props = defineProps<{ candidates: Candidate[]; winner: string }>();

const rows = computed(() => props.candidates.slice(0, 6));
const series = computed(() => [{ name: "Votes", data: rows.value.map((c) => c.votes) }]);
const height = computed(() => Math.max(140, rows.value.length * 34));

const options = computed<ApexOptions>(() => ({
  chart: { type: "bar", background: "transparent", toolbar: { show: false }, fontFamily: "inherit" },
  theme: { mode: "dark" },
  plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 4, barHeight: "58%" } },
  colors: rows.value.map((c) => (c.songId === props.winner ? "#34e39b" : "#2b3140")),
  dataLabels: { enabled: true, formatter: (v: number) => v.toLocaleString(), style: { fontSize: "10px", colors: ["#07080b"] }, offsetX: 20 },
  legend: { show: false },
  grid: { borderColor: "rgba(255,255,255,0.05)", strokeDashArray: 3 },
  xaxis: {
    categories: rows.value.map((c) => `${c.artist} — ${c.title}`),
    labels: { style: { colors: "#6b7488" } }, axisBorder: { show: false }, axisTicks: { show: false },
  },
  yaxis: { labels: { style: { colors: "#8d95a8", fontSize: "12px" }, maxWidth: 150 } },
  tooltip: { theme: "dark", y: { formatter: (v: number) => `${v} agreeing hashes` } },
}));
</script>

<template>
  <apexchart v-if="rows.length > 1" type="bar" :height="height" :options="options" :series="series" />
  <p v-else class="m-0 pt-6 text-center text-sm text-mist-500">Only one candidate scored.</p>
</template>
