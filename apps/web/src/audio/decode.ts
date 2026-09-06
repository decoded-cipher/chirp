import { SAMPLE_RATE } from "@chirp/core";

// Decimating instead would alias; the index was built at SAMPLE_RATE by ffmpeg.
export async function renderMono(buffer: AudioBuffer): Promise<Float32Array> {
  const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * SAMPLE_RATE), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

export function bufferFromPcm(pcm: Float32Array<ArrayBuffer>, sampleRate: number): AudioBuffer {
  const buffer = new AudioBuffer({ length: pcm.length, sampleRate, numberOfChannels: 1 });
  buffer.copyToChannel(pcm, 0);
  return buffer;
}
