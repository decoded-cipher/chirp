function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mixNoise(pcm: Float32Array, snrDb: number, seed = 1): Float32Array {
  const random = mulberry32(seed);

  let energy = 0;
  for (const s of pcm) energy += s * s;
  const amplitude = Math.sqrt(energy / pcm.length) / 10 ** (snrDb / 20);

  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const gaussian = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    out[i] = pcm[i]! + gaussian * amplitude;
  }
  return out;
}
