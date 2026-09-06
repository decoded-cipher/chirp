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
tally AS (
  SELECT
    f.song_id,
    CAST(FLOOR((f.anchor_frame - q.qframe) / ${OFFSET_BUCKET}.0) AS INTEGER) AS offset_bucket,
    COUNT(*) AS votes
  FROM q
  JOIN fingerprints f ON f.hash = q.hash
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

export const INSERT_SONG = `
INSERT INTO songs (title, artist, album, duration_s, frame_count, source_url,
                   license, license_url, attribution, cover_url, sha256)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
RETURNING id`;

export const SONGS_BY_ID = `SELECT * FROM songs WHERE id IN (SELECT value FROM json_each(?1))`;

export const FINGERPRINT_CHUNK = 2000;

export const MAX_POSTINGS_PER_HASH = 512;

export const PRUNE_HEAVY_HASHES = `
DELETE FROM fingerprints WHERE hash IN (
  SELECT hash FROM fingerprints GROUP BY hash HAVING COUNT(*) > ${MAX_POSTINGS_PER_HASH}
)`;
