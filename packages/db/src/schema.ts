import { nanoid } from "nanoid";

export const newSongId = (): string => nanoid();

export interface SongRow {
  id: number;
  nano_id: string;
  title: string;
  artist: string;
  album: string | null;
  duration_s: number | null;
  frame_count: number | null;
  source_url: string | null;
  attribution: string | null;
  cover_url: string | null;
  youtube_id: string | null;
  source: string | null;
  source_id: string | null;
}

export interface PublicSong extends Omit<SongRow, "id" | "nano_id"> {
  id: string;
}

export function publicSong({ id: _rowid, nano_id, ...rest }: SongRow): PublicSong {
  return { id: nano_id, ...rest };
}
