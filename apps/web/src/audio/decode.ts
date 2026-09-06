import { SAMPLE_RATE } from "@chirp/core";

export interface Decoded {
  pcm: Float32Array;
  duration: number;
  sourceRate: number;
  channels: number;
}

// Every path into the matcher resamples through here. The index was built by
// ffmpeg at SAMPLE_RATE, so a cheaper decimation would alias and shift peaks.
export async function renderMono(buffer: AudioBuffer): Promise<Float32Array> {
  const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * SAMPLE_RATE), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
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

  return {
    pcm: await renderMono(decoded),
    duration: decoded.duration,
    sourceRate: decoded.sampleRate,
    channels: decoded.numberOfChannels,
  };
}

export function bufferFromPcm(pcm: Float32Array<ArrayBuffer>, sampleRate: number): AudioBuffer {
  const buffer = new AudioBuffer({ length: pcm.length, sampleRate, numberOfChannels: 1 });
  buffer.copyToChannel(pcm, 0);
  return buffer;
}
