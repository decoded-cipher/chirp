CREATE TABLE IF NOT EXISTS songs (
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
   );

CREATE TABLE IF NOT EXISTS fingerprints (
     hash         INTEGER NOT NULL,
     song_id      INTEGER NOT NULL,
     anchor_frame INTEGER NOT NULL,
     PRIMARY KEY (hash, song_id, anchor_frame)
   ) WITHOUT ROWID;
