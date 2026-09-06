import { expect, test } from "bun:test";
import { buildIndex, match, type Fingerprint } from "@chirp/core";
import { insertFingerprints, insertSong, openIndex, rank, songsByIds } from "./store";

function prints(hashes: number[], startFrame: number): Fingerprint[] {
  return hashes.map((hash, i) => ({ hash, frame: startFrame + i }));
}

const HASHES = Array.from({ length: 60 }, (_, i) => 100 + i);

const SONGS: Record<number, Fingerprint[]> = {
  1: [...prints(HASHES, 500), ...prints(HASHES.slice(0, 40), 900)],
  2: prints(HASHES.slice(0, 25), 300),
  3: prints(HASHES.slice(30), 77),
};

function seeded() {
  const db = openIndex();
  for (const id of Object.keys(SONGS).map(Number)) {
    const inserted = insertSong(db, { title: `song ${id}`, artist: "test" });
    expect(inserted).toBe(id);
    insertFingerprints(db, id, SONGS[id]!);
  }
  return db;
}

test("sqlite ranking matches the in-memory scorer exactly", () => {
  const db = seeded();
  const memory = buildIndex(Object.entries(SONGS).map(([id, p]) => [Number(id), p] as const));

  for (const start of [0, 5, 17]) {
    const query = prints(HASHES, start);
    expect(rank(db, query)).toEqual(match(memory, query));
  }
});

test("reports one alignment per song when a chorus repeats", () => {
  expect(rank(seeded(), prints(HASHES, 0))).toEqual([
    { songId: 1, offsetBucket: 250, votes: 60 },
    { songId: 2, offsetBucket: 150, votes: 25 },
    { songId: 3, offsetBucket: 23, votes: 30 },
  ].sort((a, b) => b.votes - a.votes));
});

test("survives a fingerprint set larger than one insert chunk", () => {
  const db = openIndex();
  const id = insertSong(db, { title: "big", artist: "test" });
  const many = Array.from({ length: 5000 }, (_, i) => ({ hash: i, frame: i }));
  insertFingerprints(db, id, many);

  expect(db.query<{ n: number }, []>("SELECT COUNT(*) n FROM fingerprints").get()!.n).toBe(5000);
});

test("round-trips song metadata", () => {
  const db = openIndex();
  const id = insertSong(db, {
    title: "Freedom Calling", artist: "Camp Z", license: "CC-BY-SA-4.0",
    attribution: "Camp Z — Freedom Calling (CC BY-SA 4.0)",
  });

  const [row] = songsByIds(db, [id]);
  expect(row!.title).toBe("Freedom Calling");
  expect(row!.attribution).toBe("Camp Z — Freedom Calling (CC BY-SA 4.0)");
  expect(row!.album).toBeNull();
});
