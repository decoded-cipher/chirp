import { MAX_QUERY_HASHES, decide, offsetSeconds, type Match } from "@chirp/core";
import {
  CANDIDATES, CANDIDATE_SONGS, HISTOGRAM, MATCH, MAX_POSTINGS_PER_HASH, SONGS_BY_ID,
  SONG_COUNT, TWO_STAGE_MIN_SONGS, VERIFY, publicSong,
  type HistogramRow, type MatchRow, type SongRow,
} from "@chirp/db";
import { Hono } from "hono";
import type { Env } from "../env";

export const identify = new Hono<{ Bindings: Env }>();

identify.post("/", async (c) => {
  const body = await c.req.json<{ hashes?: unknown }>().catch(() => ({ hashes: undefined }));
  const hashes = body.hashes;

  if (!Array.isArray(hashes) || hashes.length === 0) {
    return c.json({ error: "hashes must be a non-empty array of [hash, frame] pairs" }, 400);
  }
  if (hashes.length > MAX_QUERY_HASHES) {
    return c.json({ error: `at most ${MAX_QUERY_HASHES} hashes` }, 413);
  }

  const pairs: [number, number][] = [];
  for (const entry of hashes) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [hash, frame] = entry;
    if (Number.isInteger(hash) && Number.isInteger(frame) && hash >= 0 && frame >= 0) {
      pairs.push([hash, frame]);
    }
  }
  if (pairs.length === 0) return c.json({ error: "no valid [hash, frame] pairs" }, 400);

  const query = JSON.stringify(pairs);
  const counted = await c.env.DB.prepare(SONG_COUNT).first<{ n: number }>();
  const scan = (counted?.n ?? 0) < TWO_STAGE_MIN_SONGS
    ? c.env.DB.prepare(MATCH).bind(query, MAX_POSTINGS_PER_HASH).all<MatchRow>()
    : narrow(c.env.DB, query);

  const ranked = await scan;
  const candidates: Match[] = ranked.results.map((r) => ({
    songId: r.song_id,
    offsetBucket: r.offset_bucket,
    votes: r.votes,
  }));

  const chosen = decide(candidates);
  if (!chosen) return c.json({ match: null, candidates: [], histogram: [] });

  const ids = candidates.map((m) => m.songId);
  const [songs, histogram] = await Promise.all([
    c.env.DB.prepare(SONGS_BY_ID).bind(JSON.stringify(ids)).all<SongRow>(),
    c.env.DB.prepare(HISTOGRAM)
      .bind(query, chosen.songId, MAX_POSTINGS_PER_HASH).all<HistogramRow>(),
  ]);

  const byId = new Map(songs.results.map((s) => [s.id, s]));
  const song = byId.get(chosen.songId);
  if (!song) return c.json({ match: null, candidates: [], histogram: [] });

  return c.json({
    match: {
      ...publicSong(song),
      votes: chosen.votes,
      confidence: chosen.confidence === Infinity ? null : Number(chosen.confidence.toFixed(2)),
      offsetSeconds: Number(offsetSeconds(chosen.offsetBucket).toFixed(2)),
    },
    candidates: candidates.map((m) => ({
      songId: byId.get(m.songId)?.nano_id ?? null,
      title: byId.get(m.songId)?.title ?? null,
      artist: byId.get(m.songId)?.artist ?? null,
      votes: m.votes,
      offsetSeconds: Number(offsetSeconds(m.offsetBucket).toFixed(2)),
    })),
    histogram: histogram.results.map((h) => ({
      seconds: Number(offsetSeconds(h.offset_bucket).toFixed(2)),
      votes: h.votes,
    })),
  });
});

async function narrow(db: D1Database, query: string) {
  const found = await db.prepare(CANDIDATES).bind(query, CANDIDATE_SONGS).all<{ song_id: number }>();
  const ids = found.results.map((r) => r.song_id);
  if (ids.length === 0) return { results: [] as MatchRow[] };

  return db.prepare(VERIFY)
    .bind(query, JSON.stringify(ids), MAX_POSTINGS_PER_HASH)
    .all<MatchRow>();
}
