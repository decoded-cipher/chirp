const cache = new Map<number, Float32Array>();

export function hannWindow(size: number): Float32Array {
  let w = cache.get(size);
  if (w) return w;

  w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  cache.set(size, w);
  return w;
}
