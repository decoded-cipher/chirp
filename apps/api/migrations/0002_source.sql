ALTER TABLE songs ADD COLUMN source TEXT;

ALTER TABLE songs ADD COLUMN source_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS songs_source ON songs (source, source_id);
