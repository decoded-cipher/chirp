import { Database } from "bun:sqlite";
import { decide, type Fingerprint, type Identification, type Match } from "@chirp/core";
import {
  FINGERPRINT_CHUNK, INSERT_FINGERPRINTS, INSERT_SONG, MATCH, PRUNE_HEAVY_HASHES,
  SCHEMA, SONGS_BY_ID, type MatchRow, type SongRow,
} from "@chirp/db";

export interface SongInput {
  title: string;
  artist: string;
  album?: string | null;
  duration_s?: number | null;
  frame_count?: number | null;
  source_url?: string | null;
  license?: string | null;
  license_url?: string | null;
  attribution?: string | null;
  cover_url?: string | null;
  sha256?: string | null;
}

export function openIndex(path = ":memory:"): Database {
  const db = new Database(path, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  for (const statement of SCHEMA) db.run(statement);
  return db;
}

export function insertSong(db: Database, song: SongInput): number {
  const row = db.query<{ id: number }, (string | number | null)[]>(INSERT_SONG).get(
    song.title, song.artist, song.album ?? null, song.duration_s ?? null,
    song.frame_count ?? null, song.source_url ?? null, song.license ?? null,
    song.license_url ?? null, song.attribution ?? null, song.cover_url ?? null,
    song.sha256 ?? null,
  );
  if (!row) throw new Error(`failed to insert song ${song.title}`);
  return row.id;
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

export function pruneIndex(db: Database): number {
  const before = db.query<{ n: number }, []>("SELECT COUNT(*) n FROM fingerprints").get()!.n;
  db.run(PRUNE_HEAVY_HASHES);
  return before - db.query<{ n: number }, []>("SELECT COUNT(*) n FROM fingerprints").get()!.n;
}

export function rank(db: Database, query: readonly Fingerprint[]): Match[] {
  const pairs = JSON.stringify(query.map((p) => [p.hash, p.frame]));
  return db.query<MatchRow, [string]>(MATCH).all(pairs).map((r) => ({
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
