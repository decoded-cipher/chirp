import { SAMPLE_RATE } from "@chirp/core";

export interface Decoded {
  pcm: Float32Array;
  duration: number;
  sourceRate: number;
  channels: number;
}

// decodeAudioData detaches its input, so callers must not reuse the buffer.
export async function decodeToMono(data: ArrayBuffer): Promise<Decoded> {
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(data);
  } finally {
    void context.close();
  }

  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  return {
    pcm: rendered.getChannelData(0).slice(),
    duration: decoded.duration,
    sourceRate: decoded.sampleRate,
    channels: decoded.numberOfChannels,
  };
}
