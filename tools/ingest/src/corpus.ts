import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

export const ROOT = resolve(import.meta.dir, "../../..");

const AUDIO = /\.(mp3|m4a|opus|ogg|oga|flac|wav|webm)$/i;

export interface LocalTrack {
  file: string;
  title: string;
  artist: string;
}

export async function loadCorpus(): Promise<LocalTrack[]> {
  const names = await readdir(`${ROOT}/tracks`).catch(() => [] as string[]);

  return names
    .filter((name) => AUDIO.test(name) && Bun.file(`${ROOT}/tracks/${name}`).size > 0)
    .sort()
    .map((name) => ({ file: `tracks/${name}`, title: name.replace(AUDIO, ""), artist: "local" }));
}

export function trackPath(track: LocalTrack): string {
  return `${ROOT}/${track.file}`;
}
