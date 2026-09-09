import type { Fingerprint } from "@chirp/core";
import {
  FINGERPRINT_CHUNK, catalogue, connect, findSongBySource, insertFingerprints, insertSong,
  publicSong, refreshHashStats, type Db, type SongInput,
} from "@chirp/db";
import { Hono } from "hono";
import type { Env } from "../env";

export const songs = new Hono<{ Bindings: Env; Variables: { db: Db } }>();

songs.use("*", async (c, next) => {
  const db = connect(c.env.HYPERDRIVE.connectionString);
  c.set("db", db);
  try {
    await next();
  } finally {
    c.executionCtx.waitUntil(db.end());
  }
});

songs.get("/", async (c) => {
  const rows = await catalogue(c.get("db"));
  return c.json({ songs: rows.map(publicSong) });
});

songs.get("/lookup", async (c) => {
  const source = c.req.query("source");
  const sourceId = c.req.query("id");
  if (!source || !sourceId) return c.json({ error: "source and id are required" }, 400);

  const song = await findSongBySource(c.get("db"), source, sourceId, c.req.query("url") ?? "");
  return c.json({ song });
});

songs.use("/*", async (c, next) => {
  if (c.req.method === "GET") return next();

  const expected = c.env.ADMIN_TOKEN;
  if (!expected) return c.json({ error: "ingest is disabled" }, 503);
  if (c.req.header("authorization") !== `Bearer ${expected}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
});

const text = (value: unknown) => (typeof value === "string" ? value : null);
const num = (value: unknown) => (typeof value === "number" ? value : null);

songs.post("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (typeof body.title !== "string" || typeof body.artist !== "string") {
    return c.json({ error: "title and artist are required" }, 400);
  }

  const db = c.get("db");
  const song: SongInput = {
    title: body.title,
    artist: body.artist,
    album: text(body.album),
    duration_s: num(body.duration_s),
    frame_count: num(body.frame_count),
    source_url: text(body.source_url),
    attribution: text(body.attribution),
    cover_url: text(body.cover_url),
    youtube_id: text(body.youtube_id),
    source: text(body.source),
    source_id: text(body.source_id),
  };

  // A duplicate row splits the vote and the margin rule then rejects both.
  if (song.source && song.source_id) {
    const existing = await findSongBySource(db, song.source, song.source_id, song.source_url ?? "");
    if (existing) return c.json({ songId: existing.id, existing: true });
  }

  const { id } = await insertSong(db, song);
  return c.json({ songId: id, existing: false }, 201);
});

songs.post("/:id/fingerprints", async (c) => {
  const songId = Number(c.req.param("id"));
  const { hashes } = await c.req.json<{ hashes: [number, number][] }>();

  if (!Number.isInteger(songId) || !Array.isArray(hashes)) {
    return c.json({ error: "song id and hashes are required" }, 400);
  }
  if (hashes.length > FINGERPRINT_CHUNK) {
    return c.json({ error: `at most ${FINGERPRINT_CHUNK} hashes per request` }, 413);
  }

  const prints: Fingerprint[] = hashes.map(([hash, frame]) => ({ hash, frame }));
  await insertFingerprints(c.get("db"), songId, prints);
  return c.json({ inserted: prints.length });
});

songs.post("/stats", async (c) => {
  const heavy = await refreshHashStats(c.get("db"));
  return c.json({ heavy });
});
