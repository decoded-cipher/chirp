import { SAMPLE_RATE } from "@chirp/core";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rms(pcm: Float32Array): number {
  let sum = 0;
  for (const s of pcm) sum += s * s;
  return Math.sqrt(sum / pcm.length);
}

export function mixNoise(pcm: Float32Array, snrDb: number, seed = 1): Float32Array {
  const random = mulberry32(seed);
  const amplitude = rms(pcm) / 10 ** (snrDb / 20);
  const out = new Float32Array(pcm.length);

  for (let i = 0; i < pcm.length; i++) {
    const gaussian = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    out[i] = pcm[i]! + gaussian * amplitude;
  }

  return out;
}

async function run(args: string[], stdin?: Uint8Array): Promise<ArrayBuffer> {
  const proc = Bun.spawn(["ffmpeg", "-v", "error", ...args], {
    stdin: stdin ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`ffmpeg: ${err.trim()}`);
  return out;
}

const RAW = ["-f", "f32le", "-ar", String(SAMPLE_RATE), "-ac", "1"];

export async function filtered(path: string, from: number, duration: number, af: string): Promise<Float32Array> {
  return new Float32Array(
    await run(["-ss", String(from), "-t", String(duration), "-i", path, "-af", af, ...RAW, "-"]),
  );
}

export async function recompressed(
  path: string, from: number, duration: number, bitrate: string,
): Promise<Float32Array> {
  const encoded = await run([
    "-ss", String(from), "-t", String(duration), "-i", path,
    "-c:a", "libmp3lame", "-b:a", bitrate, "-ac", "1", "-ar", "22050", "-f", "mp3", "-",
  ]);
  return new Float32Array(await run(["-i", "pipe:0", ...RAW, "-"], new Uint8Array(encoded)));
}
