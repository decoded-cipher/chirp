<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import { catalogue, identify, type IdentifyResponse, type Song } from "./api";
import { decodeToMono } from "./audio/decode";
import CaptureScreen from "./components/CaptureScreen.vue";
import ResultBoard from "./components/ResultBoard.vue";
import { runFingerprint } from "./composables/useFingerprint";
import { useMicrophone } from "./composables/useMicrophone";
import type { FingerprintReply } from "./workers/fingerprint.worker";

const WORKING: Record<string, string> = {
  decoding: "Decoding",
  fingerprinting: "Fingerprinting",
  matching: "Searching the index",
};

const working = ref<string | null>(null);
const error = ref<string | null>(null);
const result = ref<IdentifyResponse | null>(null);
const print = shallowRef<FingerprintReply | null>(null);
const pcm = shallowRef<Float32Array | null>(null);
const telemetry = ref<{ rate: number; channels: number; duration: number; queryMs: number } | null>(null);
const songs = ref<Song[]>([]);

const mic = useMicrophone(6);

onMounted(async () => {
  try {
    songs.value = await catalogue();
  } catch (e) {
    error.value = (e as Error).message;
  }
});

function reset() {
  result.value = null;
  print.value = null;
  pcm.value = null;
  telemetry.value = null;
  error.value = null;
}

async function analyse(data: ArrayBuffer) {
  reset();

  try {
    working.value = WORKING.decoding!;
    const decoded = await decodeToMono(data);
    pcm.value = decoded.pcm;

    working.value = WORKING.fingerprinting!;
    const printed = await runFingerprint(decoded.pcm);

    working.value = WORKING.matching!;
    const started = performance.now();
    const response = await identify(printed.hashes);

    print.value = printed;
    result.value = response;
    telemetry.value = {
      rate: decoded.sourceRate,
      channels: decoded.channels,
      duration: decoded.duration,
      queryMs: performance.now() - started,
    };
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    working.value = null;
  }
}

async function listen() {
  try {
    const capture = await mic.record();
    await analyse(await capture.blob.arrayBuffer());
  } catch {
    error.value = "Microphone unavailable or permission denied.";
  }
}
</script>

<template>
  <ResultBoard
    v-if="result && print && telemetry"
    :result="result" :print="print" :pcm="pcm" :telemetry="telemetry" :indexed="songs.length"
    @again="reset"
  />

  <template v-else>
    <CaptureScreen
      :listening="mic.listening.value"
      :remaining="mic.remaining.value"
      :level="mic.level.value"
      :mic-supported="mic.supported"
      :working="working"
      :indexed="songs.length"
      @listen="listen"
      @file="async (f) => analyse(await f.arrayBuffer())"
    />

    <p v-if="error"
       class="fixed inset-x-0 bottom-20 mx-auto w-fit rounded-full border border-fail-500/40 bg-fail-500/10 px-4 py-2 text-xs text-fail-500">
      {{ error }}
    </p>
  </template>
</template>
