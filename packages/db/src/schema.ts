export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS songs (
     id          INTEGER PRIMARY KEY,
     title       TEXT NOT NULL,
     artist      TEXT NOT NULL,
     album       TEXT,
     duration_s  REAL,
     frame_count INTEGER,
     source_url  TEXT,
     license     TEXT,
     license_url TEXT,
     attribution TEXT,
     cover_url   TEXT,
     youtube_id  TEXT,
     isrc        TEXT,
     sha256      TEXT UNIQUE,
     created_at  INTEGER NOT NULL DEFAULT (unixepoch())
   )`,
  `CREATE TABLE IF NOT EXISTS fingerprints (
     hash         INTEGER NOT NULL,
     song_id      INTEGER NOT NULL,
     anchor_frame INTEGER NOT NULL,
     PRIMARY KEY (hash, song_id, anchor_frame)
   ) WITHOUT ROWID`,
];

export interface SongRow {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  duration_s: number | null;
  frame_count: number | null;
  source_url: string | null;
  license: string | null;
  license_url: string | null;
  attribution: string | null;
  cover_url: string | null;
  youtube_id: string | null;
}

export interface MatchRow {
  song_id: number;
  offset_bucket: number;
  votes: number;
}
