import { onScopeDispose, ref } from "vue";

export interface Capture {
  blob: Blob;
  seconds: number;
}

export function useMicrophone(seconds = 6) {
  const listening = ref(false);
  const remaining = ref(seconds);
  const level = ref(0);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let raf = 0;

  function teardown() {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    void context?.close();
    stream = null;
    context = null;
    listening.value = false;
    level.value = 0;
  }

  onScopeDispose(teardown);

  async function record(): Promise<Capture> {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });

    context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);

    const samples = new Uint8Array(analyser.frequencyBinCount);
    const meter = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += (s - 128) ** 2;
      level.value = Math.min(1, Math.sqrt(sum / samples.length) / 40);
      raf = requestAnimationFrame(meter);
    };
    meter();

    const recorder = new MediaRecorder(stream);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);

    listening.value = true;
    remaining.value = seconds;
    recorder.start();

    const countdown = setInterval(() => { remaining.value = Math.max(0, remaining.value - 0.1); }, 100);

    return new Promise<Capture>((resolve, reject) => {
      recorder.onstop = () => {
        clearInterval(countdown);
        teardown();
        resolve({ blob: new Blob(chunks, { type: recorder.mimeType }), seconds });
      };
      recorder.onerror = () => {
        clearInterval(countdown);
        teardown();
        reject(new Error("recording failed"));
      };
      setTimeout(() => recorder.state !== "inactive" && recorder.stop(), seconds * 1000);
    });
  }

  return { listening, remaining, level, supported, record, cancel: teardown };
}
