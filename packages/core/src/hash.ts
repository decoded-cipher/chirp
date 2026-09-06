import { FAN_OUT, FREQ_FUZZ, TARGET_ZONE_MAX, TARGET_ZONE_MIN } from "./constants";
import type { Peak } from "./peaks";

export interface Fingerprint {
  hash: number;
  frame: number;
}

export interface HashParts {
  anchor: number;
  target: number;
  dt: number;
}

export interface FingerprintOptions {
  fanOut?: number;
  freqFuzz?: number;
  targetZoneMax?: number;
}

// 24 bits: staying under 31 keeps JS signed bitwise ops from producing a negative hash.
export function packHash(anchorBin: number, targetBin: number, dt: number, fuzz = FREQ_FUZZ): number {
  return ((anchorBin >> fuzz) << 15) | ((targetBin >> fuzz) << 6) | dt;
}

export function unpackHash(hash: number): HashParts {
  return { anchor: (hash >> 15) & 0x1ff, target: (hash >> 6) & 0x1ff, dt: hash & 0x3f };
}

export function fingerprint(peaks: readonly Peak[], options: FingerprintOptions = {}): Fingerprint[] {
  const fanOut = options.fanOut ?? FAN_OUT;
  const fuzz = options.freqFuzz ?? FREQ_FUZZ;
  const zoneMax = options.targetZoneMax ?? TARGET_ZONE_MAX;
  const out: Fingerprint[] = [];

  for (let i = 0; i < peaks.length; i++) {
    const anchor = peaks[i]!;
    let paired = 0;

    for (let j = i + 1; j < peaks.length && paired < fanOut; j++) {
      const target = peaks[j]!;
      const dt = target.frame - anchor.frame;
      if (dt < TARGET_ZONE_MIN) continue;
      if (dt > zoneMax) break;

      out.push({ hash: packHash(anchor.bin, target.bin, dt, fuzz), frame: anchor.frame });
      paired++;
    }
  }

  return out;
}
