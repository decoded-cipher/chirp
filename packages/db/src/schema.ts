import { nanoid } from "nanoid";

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS songs (
     id          INTEGER PRIMARY KEY,
     nano_id     TEXT NOT NULL UNIQUE,
     title       TEXT NOT NULL,
     artist      TEXT NOT NULL,
     album       TEXT,
     duration_s  REAL,
     frame_count INTEGER,
     source_url  TEXT,
     attribution TEXT,
     cover_url   TEXT,
     youtube_id  TEXT,
     source      TEXT,
     source_id   TEXT,
     isrc        TEXT,
     created_at  INTEGER NOT NULL DEFAULT (unixepoch())
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS songs_source ON songs (source, source_id)`,
  `CREATE TABLE IF NOT EXISTS fingerprints (
     hash         INTEGER NOT NULL,
     song_id      INTEGER NOT NULL,
     anchor_frame INTEGER NOT NULL,
     PRIMARY KEY (hash, song_id, anchor_frame)
   ) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS hash_stats (
     hash     INTEGER PRIMARY KEY,
     postings INTEGER NOT NULL
   ) WITHOUT ROWID`,
];

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

export interface HistogramRow {
  offset_bucket: number;
  votes: number;
}

export interface MatchRow {
  song_id: number;
  offset_bucket: number;
  votes: number;
}
