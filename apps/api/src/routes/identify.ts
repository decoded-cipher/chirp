import {
  MAX_QUERY_HASHES, MIN_VOTES, bestPerSong, decide, mergeTallies, offsetSeconds,
  type Fingerprint, type Match,
} from "@chirp/core";
import {
  CARRY_LIMIT, CARRY_VOTE_FLOOR, RANKED_LIMIT, asMatches, connect, publicSong, rank, songById,
  type Candidate,
} from "@chirp/db";
import { Hono } from "hono";
import type { Env } from "../env";

export const identify = new Hono<{ Bindings: Env }>();

function readPairs(input: unknown): Fingerprint[] {
  const prints: Fingerprint[] = [];
  if (!Array.isArray(input)) return prints;

  for (const entry of input) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [hash, frame] = entry;
    if (Number.isInteger(hash) && Number.isInteger(frame) && hash >= 0 && frame >= 0) {
      prints.push({ hash, frame });
    }
  }
  return prints;
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

  const query = readPairs(body.hashes);
  if (query.length === 0) return c.json({ error: "no valid [hash, frame] pairs" }, 400);

  const accumulating = Array.isArray(body.carry);
  const carry = readCarry(body.carry);
  const db = connect(c.env.HYPERDRIVE.connectionString);

  try {
    const { candidates, histogram } = await rank(
      db,
      query,
      accumulating ? CARRY_VOTE_FLOOR : MIN_VOTES,
      accumulating ? CARRY_LIMIT : RANKED_LIMIT,
    );

    const rows = asMatches(candidates);
    const totals = accumulating ? mergeTallies(carry, rows) : rows;
    const ranked = bestPerSong(totals).filter((m) => m.votes >= MIN_VOTES).slice(0, RANKED_LIMIT);
    const tally = accumulating ? totals.slice(0, CARRY_LIMIT) : [];
    const empty = { match: null, candidates: [], histogram: [], tally };

    const chosen = decide(ranked);
    if (!chosen) return c.json(empty);

    const byId = new Map<number, Candidate>(candidates.map((s) => [s.id, s]));
    // A song can top the accumulated tally without appearing in this round's
    // candidates, in which case its metadata has to be fetched.
    const song = byId.get(chosen.songId) ?? await songById(db, chosen.songId);
    if (!song) return c.json(empty);

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
      histogram: histogram.map(([bucket, votes]) => ({
        seconds: Number(offsetSeconds(bucket).toFixed(2)),
        votes,
      })),
      tally: tally.map((m) => [m.songId, m.offsetBucket, m.votes]),
    });
  } finally {
    c.executionCtx.waitUntil(db.end());
  }
});
