import { MIN_VOTES, OFFSET_BUCKET } from "@chirp/core";

export const INSERT_FINGERPRINTS = `
INSERT OR IGNORE INTO fingerprints (hash, song_id, anchor_frame)
SELECT json_extract(value, '$[0]'), ?2, json_extract(value, '$[1]')
FROM json_each(?1)`;

export const MATCH = `
WITH q(hash, qframe) AS (
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]')
  FROM json_each(?1)
),
kept AS (
  SELECT q.hash, q.qframe
  FROM q LEFT JOIN hash_stats hs ON hs.hash = q.hash
  WHERE COALESCE(hs.postings, 0) <= ?2
),
tally AS (
  SELECT
    f.song_id,
    CAST(FLOOR((f.anchor_frame - kept.qframe) / ${OFFSET_BUCKET}.0) AS INTEGER) AS offset_bucket,
    COUNT(*) AS votes
  FROM kept
  JOIN fingerprints f ON f.hash = kept.hash
  GROUP BY f.song_id, offset_bucket
  HAVING votes >= ${MIN_VOTES} AND offset_bucket >= 0
),
best AS (
  SELECT song_id, offset_bucket, votes,
         ROW_NUMBER() OVER (PARTITION BY song_id ORDER BY votes DESC) AS rn
  FROM tally
)
SELECT song_id, offset_bucket, votes
FROM best
WHERE rn = 1
ORDER BY votes DESC
LIMIT 10`;

export const HISTOGRAM = `
WITH q(hash, qframe) AS (
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]')
  FROM json_each(?1)
),
kept AS (
  SELECT q.hash, q.qframe
  FROM q LEFT JOIN hash_stats hs ON hs.hash = q.hash
  WHERE COALESCE(hs.postings, 0) <= ?3
)
SELECT
  CAST(FLOOR((f.anchor_frame - kept.qframe) / ${OFFSET_BUCKET}.0) AS INTEGER) AS offset_bucket,
  COUNT(*) AS votes
FROM kept
JOIN fingerprints f ON f.hash = kept.hash
WHERE f.song_id = ?2
GROUP BY offset_bucket
HAVING offset_bucket >= 0
ORDER BY offset_bucket
LIMIT 6000`;

export const INSERT_SONG = `
INSERT INTO songs (nano_id, title, artist, album, duration_s, frame_count,
                   source_url, attribution, cover_url, youtube_id, source, source_id)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
RETURNING id, nano_id`;

// Rows predating source_id still carry source_url.
export const SONG_BY_SOURCE = `
SELECT id, title, artist FROM songs
WHERE (source = ?1 AND source_id = ?2) OR (source_url IS NOT NULL AND source_url = ?3)`;

export const SONGS_BY_ID = `SELECT * FROM songs WHERE id IN (SELECT value FROM json_each(?1))`;

export const FINGERPRINT_CHUNK = 2000;

export const HEAVY_FLOOR = 32;

export const MAX_POSTINGS_PER_HASH = 512;

export const CLEAR_HASH_STATS = `DELETE FROM hash_stats`;

export const REFRESH_HASH_STATS = `
INSERT OR REPLACE INTO hash_stats (hash, postings)
SELECT hash, COUNT(*) FROM fingerprints
GROUP BY hash HAVING COUNT(*) > ${HEAVY_FLOOR}`;
