import { Database } from "bun:sqlite";
import { decide, type Fingerprint, type Identification, type Match } from "@chirp/core";
import {
  CLEAR_HASH_STATS, FINGERPRINT_CHUNK, INSERT_FINGERPRINTS, INSERT_SONG, MATCH,
  MAX_POSTINGS_PER_HASH, REFRESH_HASH_STATS, SCHEMA, SONGS_BY_ID, SONG_BY_SOURCE,
  newSongId, type MatchRow, type SongRow,
} from "@chirp/db";

export interface SongInput {
  title: string;
  artist: string;
  album?: string | null;
  duration_s?: number | null;
  frame_count?: number | null;
  source_url?: string | null;
  attribution?: string | null;
  cover_url?: string | null;
  youtube_id?: string | null;
  source?: string | null;
  source_id?: string | null;
}

export function openIndex(path = ":memory:"): Database {
  const db = new Database(path, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  for (const statement of SCHEMA) db.run(statement);
  return db;
}

export function insertSong(db: Database, song: SongInput): number {
  const row = db.query<{ id: number }, (string | number | null)[]>(INSERT_SONG).get(
    newSongId(), song.title, song.artist, song.album ?? null, song.duration_s ?? null,
    song.frame_count ?? null, song.source_url ?? null, song.attribution ?? null,
    song.cover_url ?? null, song.youtube_id ?? null, song.source ?? null,
    song.source_id ?? null,
  );
  if (!row) throw new Error(`failed to insert song ${song.title}`);
  return row.id;
}

export function findSongBySource(
  db: Database, source: string, sourceId: string, sourceUrl: string,
): { id: number; title: string } | null {
  return db
    .query<{ id: number; title: string }, [string, string, string]>(SONG_BY_SOURCE)
    .get(source, sourceId, sourceUrl);
}

export function insertFingerprints(db: Database, songId: number, prints: readonly Fingerprint[]): void {
  const statement = db.query(INSERT_FINGERPRINTS);
  const write = db.transaction((chunk: [number, number][]) => {
    statement.run(JSON.stringify(chunk), songId);
  });

  for (let i = 0; i < prints.length; i += FINGERPRINT_CHUNK) {
    write(prints.slice(i, i + FINGERPRINT_CHUNK).map((p) => [p.hash, p.frame]));
  }
}

export function refreshHashStats(db: Database): number {
  db.run(CLEAR_HASH_STATS);
  db.run(REFRESH_HASH_STATS);
  return db.query<{ n: number }, []>("SELECT COUNT(*) n FROM hash_stats").get()!.n;
}

export function rank(
  db: Database, query: readonly Fingerprint[], cap = MAX_POSTINGS_PER_HASH,
): Match[] {
  const pairs = JSON.stringify(query.map((p) => [p.hash, p.frame]));
  return db.query<MatchRow, [string, number]>(MATCH).all(pairs, cap).map((r) => ({
    songId: r.song_id,
    offsetBucket: r.offset_bucket,
    votes: r.votes,
  }));
}

export function identifyIn(db: Database, query: readonly Fingerprint[]): Identification | null {
  return decide(rank(db, query));
}

export function songsByIds(db: Database, ids: readonly number[]): SongRow[] {
  return db.query<SongRow, [string]>(SONGS_BY_ID).all(JSON.stringify(ids));
}
