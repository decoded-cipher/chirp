import { resolve } from "node:path";

export interface CorpusTrack {
  file: string;
  title: string;
  artist: string;
  album: string | null;
  duration_s: number;
  sample_rate: number;
  channels: number;
  source_url: string;
  license: string;
  license_url: string | null;
  attribution: string;
  cover_url?: string | null;
  source?: string | null;
  source_id?: string | null;
  youtube_id?: string | null;
  sha256?: string | null;
  frame_count?: number;
}

export const ROOT = resolve(import.meta.dir, "../../..");

export async function loadCorpus(): Promise<CorpusTrack[]> {
  return Bun.file(`${ROOT}/corpus.json`).json();
}

export function trackPath(track: CorpusTrack): string {
  return `${ROOT}/${track.file}`;
}
