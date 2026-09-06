import {
  FINGERPRINT_CHUNK, INSERT_FINGERPRINTS, INSERT_SONG, PRUNE_HEAVY_HASHES, SONG_BY_SOURCE,
  newSongId, publicSong, type SongRow,
} from "@chirp/db";
import { Hono } from "hono";
import type { Env } from "../env";

export const songs = new Hono<{ Bindings: Env }>();

songs.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM songs ORDER BY artist, title",
  ).all<SongRow>();
  return c.json({ songs: results.map(publicSong) });
});

songs.get("/lookup", async (c) => {
  const source = c.req.query("source");
  const sourceId = c.req.query("id");
  if (!source || !sourceId) return c.json({ error: "source and id are required" }, 400);

  const row = await c.env.DB.prepare(SONG_BY_SOURCE)
    .bind(source, sourceId, c.req.query("url") ?? "")
    .first<{ id: number }>();
  return c.json({ song: row ?? null });
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

songs.post("/", async (c) => {
  const s = await c.req.json<Record<string, unknown>>();
  if (typeof s.title !== "string" || typeof s.artist !== "string") {
    return c.json({ error: "title and artist are required" }, 400);
  }

  // A duplicate row splits the vote and the margin rule then rejects both.
  if (typeof s.source === "string" && typeof s.source_id === "string") {
    const existing = await c.env.DB.prepare(SONG_BY_SOURCE)
      .bind(s.source, s.source_id, s.source_url ?? "")
      .first<{ id: number }>();
    if (existing) return c.json({ songId: existing.id, existing: true });
  }

  const row = await c.env.DB.prepare(INSERT_SONG).bind(
    newSongId(), s.title, s.artist, s.album ?? null, s.duration_s ?? null,
    s.frame_count ?? null, s.source_url ?? null, s.attribution ?? null,
    s.cover_url ?? null, s.youtube_id ?? null, s.source ?? null, s.source_id ?? null,
  ).first<{ id: number }>();

  return c.json({ songId: row?.id, existing: false }, 201);
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

  await c.env.DB.prepare(INSERT_FINGERPRINTS).bind(JSON.stringify(hashes), songId).run();
  return c.json({ inserted: hashes.length });
});

songs.post("/prune", async (c) => {
  const result = await c.env.DB.prepare(PRUNE_HEAVY_HASHES).run();
  return c.json({ pruned: result.meta.changes });
});
