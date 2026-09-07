CREATE TABLE IF NOT EXISTS hash_stats (
  hash     INTEGER PRIMARY KEY,
  postings INTEGER NOT NULL
) WITHOUT ROWID;

INSERT OR REPLACE INTO hash_stats (hash, postings)
SELECT hash, COUNT(*) FROM fingerprints
GROUP BY hash HAVING COUNT(*) > 32;
