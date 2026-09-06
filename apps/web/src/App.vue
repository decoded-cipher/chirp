<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import { catalogue, type IdentifyResponse, type Song } from "./api";
import CaptureScreen from "./components/CaptureScreen.vue";
import ResultBoard from "./components/ResultBoard.vue";
import { useLiveIdentify, type Telemetry } from "./composables/useLiveIdentify";
import { useMicrophone } from "./composables/useMicrophone";
import type { FingerprintReply } from "./workers/fingerprint.worker";

const error = ref<string | null>(null);
const result = ref<IdentifyResponse | null>(null);
const print = shallowRef<FingerprintReply | null>(null);
const pcm = shallowRef<Float32Array | null>(null);
const telemetry = ref<Telemetry | null>(null);
const songs = ref<Song[]>([]);

const mic = useMicrophone();
const listener = useLiveIdentify(mic);

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

async function listen() {
  reset();

  try {
    await mic.start();
  } catch {
    error.value = "Microphone unavailable or permission denied.";
    return;
  }

  const settled = await listener.run();
  mic.stop();

  if (!settled) {
    error.value = listener.error.value ?? "Nothing matched. Move closer to the sound and try again.";
    return;
  }

  result.value = settled.result;
  print.value = settled.print;
  pcm.value = settled.pcm;
  telemetry.value = settled.telemetry;
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
      :elapsed="mic.elapsed.value"
      :level="mic.level.value"
      :mic-supported="mic.supported"
      :indexed="songs.length"
      :live="listener.live.value"
      :rounds="listener.rounds.value"
      @listen="listen"
      @stop="listener.cancel"
    />

    <p v-if="error"
       class="fixed inset-x-0 bottom-20 mx-auto w-fit rounded-full border border-fail-500/40 bg-fail-500/10 px-4 py-2 text-xs text-fail-500">
      {{ error }}
    </p>
  </template>
</template>
