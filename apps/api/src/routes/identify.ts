import {
  MAX_QUERY_HASHES, MIN_VOTES, bestPerSong, decide, mergeTallies, offsetSeconds, type Match,
} from "@chirp/core";
import {
  CANDIDATES, CANDIDATE_SONGS, CARRY_LIMIT, CARRY_VOTE_FLOOR, HISTOGRAM, MATCH,
  MAX_POSTINGS_PER_HASH, RANKED_LIMIT, SONGS_BY_ID, SONG_COUNT, TWO_STAGE_MIN_SONGS, VERIFY,
  publicSong, type HistogramRow, type MatchRow, type SongRow,
} from "@chirp/db";
import { Hono } from "hono";
import type { Env } from "../env";

export const identify = new Hono<{ Bindings: Env }>();

const toMatches = (rows: MatchRow[]): Match[] =>
  rows.map((r) => ({ songId: r.song_id, offsetBucket: r.offset_bucket, votes: r.votes }));

function readPairs(input: unknown): [number, number][] {
  const pairs: [number, number][] = [];
  if (!Array.isArray(input)) return pairs;

  for (const entry of input) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [hash, frame] = entry;
    if (Number.isInteger(hash) && Number.isInteger(frame) && hash >= 0 && frame >= 0) {
      pairs.push([hash, frame]);
    }
  }
  return pairs;
}

function readCarry(input: unknown): Match[] {
  const carried: Match[] = [];
  if (!Array.isArray(input)) return carried;

  for (const entry of input.slice(0, CARRY_LIMIT)) {
    if (!Array.isArray(entry) || entry.length !== 3) continue;
    const [songId, offsetBucket, votes] = entry;
    if (Number.isInteger(songId) && Number.isInteger(offsetBucket) && Number.isInteger(votes)
      && votes > 0 && offsetBucket >= 0) {
      carried.push({ songId, offsetBucket, votes });
    }
  }
  return carried;
}

identify.post("/", async (c) => {
  type Body = { hashes?: unknown; carry?: unknown };
  const body: Body = await c.req.json<Body>().catch(() => ({}));

  if (!Array.isArray(body.hashes) || body.hashes.length === 0) {
    return c.json({ error: "hashes must be a non-empty array of [hash, frame] pairs" }, 400);
  }
  if (body.hashes.length > MAX_QUERY_HASHES) {
    return c.json({ error: `at most ${MAX_QUERY_HASHES} hashes` }, 413);
  }

  const pairs = readPairs(body.hashes);
  if (pairs.length === 0) return c.json({ error: "no valid [hash, frame] pairs" }, 400);

  const accumulating = Array.isArray(body.carry);
  const carry = readCarry(body.carry);
  const floor = accumulating ? CARRY_VOTE_FLOOR : MIN_VOTES;
  const limit = accumulating ? CARRY_LIMIT : RANKED_LIMIT;
  const query = JSON.stringify(pairs);

  const counted = await c.env.DB.prepare(SONG_COUNT).first<{ n: number }>();
  const scan = (counted?.n ?? 0) < TWO_STAGE_MIN_SONGS
    ? c.env.DB.prepare(MATCH).bind(query, MAX_POSTINGS_PER_HASH, floor, limit).all<MatchRow>()
    : narrow(c.env.DB, query, floor, limit);

  const rows = toMatches((await scan).results);
  const totals = accumulating ? mergeTallies(carry, rows) : rows;
  const ranked = bestPerSong(totals).filter((m) => m.votes >= MIN_VOTES);
  const tally = accumulating ? totals.slice(0, CARRY_LIMIT) : [];

  const chosen = decide(ranked);
  if (!chosen) return c.json({ match: null, candidates: [], histogram: [], tally });

  const ids = ranked.map((m) => m.songId);
  const [songs, histogram] = await Promise.all([
    c.env.DB.prepare(SONGS_BY_ID).bind(JSON.stringify(ids)).all<SongRow>(),
    c.env.DB.prepare(HISTOGRAM).bind(query, chosen.songId, MAX_POSTINGS_PER_HASH).all<HistogramRow>(),
  ]);

  const byId = new Map(songs.results.map((s) => [s.id, s]));
  const song = byId.get(chosen.songId);
  if (!song) return c.json({ match: null, candidates: [], histogram: [], tally });

  return c.json({
    match: {
      ...publicSong(song),
      votes: chosen.votes,
      confidence: chosen.confidence === Infinity ? null : Number(chosen.confidence.toFixed(2)),
      offsetSeconds: Number(offsetSeconds(chosen.offsetBucket).toFixed(2)),
    },
    candidates: ranked.map((m) => ({
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
    tally: tally.map((m) => [m.songId, m.offsetBucket, m.votes]),
  });
});

async function narrow(db: D1Database, query: string, floor: number, limit: number) {
  const found = await db.prepare(CANDIDATES).bind(query, CANDIDATE_SONGS).all<{ song_id: number }>();
  const ids = found.results.map((r) => r.song_id);
  if (ids.length === 0) return { results: [] as MatchRow[] };

  return db.prepare(VERIFY)
    .bind(query, JSON.stringify(ids), MAX_POSTINGS_PER_HASH, floor, limit)
    .all<MatchRow>();
}
