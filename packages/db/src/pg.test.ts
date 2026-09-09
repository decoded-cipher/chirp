import { afterAll, expect, test } from "bun:test";
import { buildIndex, match, type Fingerprint } from "@chirp/core";
import { PG_SCHEMA, asMatches, connect, insertFingerprints, insertSong, rank } from "./pg";

const URL = process.env.PG_URL ?? "postgres://chirp:chirp@localhost:55432/chirp";
const db = connect(URL, 1);

const reachable = await db`SELECT 1`.then(() => true).catch(() => false);
afterAll(() => db.end());

function prints(hashes: number[], startFrame: number): Fingerprint[] {
  return hashes.map((hash, i) => ({ hash, frame: startFrame + i }));
}

const HASHES = Array.from({ length: 60 }, (_, i) => 100 + i);

const SONGS: Record<number, Fingerprint[]> = {
  1: [...prints(HASHES, 500), ...prints(HASHES.slice(0, 40), 900)],
  2: prints(HASHES.slice(0, 25), 300),
  3: prints(HASHES.slice(30), 77),
};

async function seeded() {
  await db.unsafe("DROP SCHEMA IF EXISTS chirp_test CASCADE");
  await db.unsafe("CREATE SCHEMA chirp_test");
  await db.unsafe("SET search_path TO chirp_test");
  for (const statement of PG_SCHEMA) await db.unsafe(statement);

  for (const id of Object.keys(SONGS).map(Number)) {
    const { id: inserted } = await insertSong(db, { title: `song ${id}`, artist: "test" });
    expect(inserted).toBe(id);
    await insertFingerprints(db, id, SONGS[id]!);
  }
}

test.skipIf(!reachable)("postgres ranking matches the in-memory scorer exactly", async () => {
  await seeded();
  const memory = buildIndex(Object.entries(SONGS).map(([id, p]) => [Number(id), p] as const));

  for (const start of [0, 5, 17]) {
    const query = prints(HASHES, start);
    const { candidates } = await rank(db, query);
    expect(asMatches(candidates)).toEqual(match(memory, query));
  }
});

test.skipIf(!reachable)("reports one alignment per song when a chorus repeats", async () => {
  await seeded();
  const { candidates } = await rank(db, prints(HASHES, 0));

  expect(asMatches(candidates)).toEqual([
    { songId: 1, offsetBucket: 250, votes: 60 },
    { songId: 3, offsetBucket: 23, votes: 30 },
    { songId: 2, offsetBucket: 150, votes: 25 },
  ]);
});

test.skipIf(!reachable)("returns the histogram of the winning song only", async () => {
  await seeded();
  const { histogram } = await rank(db, prints(HASHES, 0));

  expect(histogram.length).toBeGreaterThan(0);
  expect(histogram.map(([bucket]) => bucket)).toContain(250);
  expect(histogram.reduce((sum, [, votes]) => sum + votes, 0)).toBe(100);
});
