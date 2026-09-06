import type { Fingerprint } from "./hash";

export const MAX_QUERY_HASHES = 2000;

// Stride keeps the query spread across the whole snippet; measured against
// taking the first N or a random N, it recovers more under noise at equal size.
export function sampleFingerprints(prints: readonly Fingerprint[], max = MAX_QUERY_HASHES): Fingerprint[] {
  if (prints.length <= max) return [...prints];

  const stride = prints.length / max;
  const out: Fingerprint[] = [];
  for (let i = 0; i < max; i++) out.push(prints[Math.floor(i * stride)]!);
  return out;
}
