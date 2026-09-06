DROP INDEX IF EXISTS songs_source;

DROP TABLE IF EXISTS fingerprints;

DROP TABLE IF EXISTS songs;

CREATE TABLE songs (
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
);

CREATE UNIQUE INDEX songs_source ON songs (source, source_id);

CREATE TABLE fingerprints (
  hash         INTEGER NOT NULL,
  song_id      INTEGER NOT NULL,
  anchor_frame INTEGER NOT NULL,
  PRIMARY KEY (hash, song_id, anchor_frame)
) WITHOUT ROWID;
