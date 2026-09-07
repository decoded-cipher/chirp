export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration_s: number | null;
  attribution: string | null;
  youtube_id: string | null;
}

export interface MatchResult extends Song {
  votes: number;
  confidence: number | null;
  offsetSeconds: number;
}

export interface Candidate {
  songId: string | null;
  title: string | null;
  artist: string | null;
  votes: number;
  offsetSeconds: number;
}

export type Tally = [songId: number, offsetBucket: number, votes: number][];

export interface IdentifyResponse {
  match: MatchResult | null;
  candidates: Candidate[];
  histogram: { seconds: number; votes: number }[];
  tally: Tally;
}

export async function identify(
  hashes: [number, number][], carry?: Tally,
): Promise<IdentifyResponse> {
  const res = await fetch("/api/identify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(carry ? { hashes, carry } : { hashes }),
  });
  if (!res.ok) throw new Error(`Identification failed (${res.status})`);
  return res.json();
}

export async function catalogue(): Promise<Song[]> {
  const res = await fetch("/api/songs");
  if (!res.ok) throw new Error(`Could not load catalogue (${res.status})`);
  return (await res.json()).songs;
}
