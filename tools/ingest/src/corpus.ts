export interface CorpusTrack {
  file: string;
  title: string;
  artist: string;
  album: string;
  duration_s: number;
  sample_rate: number;
  channels: number;
  source_url: string;
  license: string;
  license_url: string;
  attribution: string;
}

export const ROOT = `${import.meta.dir}/../../..`;

export async function loadCorpus(): Promise<CorpusTrack[]> {
  return Bun.file(`${ROOT}/corpus.json`).json();
}

export function trackPath(track: CorpusTrack): string {
  return `${ROOT}/${track.file}`;
}
