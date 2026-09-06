import { onScopeDispose, ref } from "vue";
import { bufferFromPcm } from "../audio/decode";
import { Ring } from "../audio/ring";

const RING_SECONDS = 30;

export function useMicrophone() {
  const listening = ref(false);
  const elapsed = ref(0);
  const level = ref(0);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let ring = new Ring(0);
  let rate = 0;

  function stop() {
    stream?.getTracks().forEach((track) => track.stop());
    void context?.close();
    stream = null;
    context = null;
    listening.value = false;
    level.value = 0;
  }

  onScopeDispose(stop);

  function append(chunk: Float32Array) {
    ring.write(chunk);
    elapsed.value = ring.written / rate;

    let sum = 0;
    for (const sample of chunk) sum += sample * sample;
    level.value = level.value * 0.6 + Math.min(1, Math.sqrt(sum / chunk.length) * 6) * 0.4;
  }

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });

    context = new AudioContext();
    await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}capture-worklet.js`);

    rate = context.sampleRate;
    ring = new Ring(RING_SECONDS * rate);
    elapsed.value = 0;

    const node = new AudioWorkletNode(context, "capture");
    node.port.onmessage = (event: MessageEvent<Float32Array>) => append(event.data);
    context.createMediaStreamSource(stream).connect(node);

    // Firefox stops pulling a worklet that leads nowhere, so terminate the graph
    // at a silent gain rather than leaving the node dangling.
    const silent = context.createGain();
    silent.gain.value = 0;
    node.connect(silent).connect(context.destination);

    listening.value = true;
  }

  const recent = (seconds: number) => bufferFromPcm(ring.last(Math.floor(seconds * rate)), rate);

  return { listening, elapsed, level, supported, start, stop, recent };
}
