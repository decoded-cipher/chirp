interface Twiddles {
  re: Float64Array;
  im: Float64Array;
}

const cache = new Map<number, Twiddles>();

function twiddles(n: number): Twiddles {
  let t = cache.get(n);
  if (t) return t;

  const half = n >> 1;
  const re = new Float64Array(half);
  const im = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    const angle = (-2 * Math.PI * i) / n;
    re[i] = Math.cos(angle);
    im[i] = Math.sin(angle);
  }
  t = { re, im };
  cache.set(n, t);
  return t;
}

export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n !== im.length) throw new Error("fft: re and im must be the same length");
  if (n === 0 || (n & (n - 1)) !== 0) throw new Error(`fft: length must be a power of two, got ${n}`);

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  const { re: wRe, im: wIm } = twiddles(n);
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let base = 0; base < n; base += len) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = base + j;
        const b = a + half;
        const vRe = re[b]! * wRe[k]! - im[b]! * wIm[k]!;
        const vIm = re[b]! * wIm[k]! + im[b]! * wRe[k]!;
        re[b] = re[a]! - vRe;
        im[b] = im[a]! - vIm;
        re[a] = re[a]! + vRe;
        im[a] = im[a]! + vIm;
      }
    }
  }
}
