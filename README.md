# chirp

Audio fingerprinting built from scratch in TypeScript — no DSP libraries, no ML.
A spectrogram, a constellation of peaks, hashed frequency pairs, and a vote on
time coherence. Six seconds of a song is enough to name it and locate the exact
moment it was playing.

## What it does

The browser records, builds a spectrogram, finds the peaks, hashes them into
pairs and sends **only integers** to the server — never audio. The server
matches those hashes against an index and answers with the track and the
position it was playing.

The DSP pipeline in [`packages/core`](packages/core/src) touches no environment
APIs, so the same code runs in a browser worker, in Bun and in a Cloudflare
Worker.

## How it works

**1 · Spectrogram.** Decode to mono at 11,025 Hz, slice into 1024-sample frames
overlapping by half, apply a Hann window, run an FFT. One frame every 46 ms.

**2 · Peaks.** Six logarithmic bands, keep the loudest bin in each, then discard
anything below the mean of those six. A per-band decaying threshold suppresses
whichever band has been loud recently, so a sustained bassline stops flooding
the index. About 25 peaks per second survive.

**3 · Pairs.** Every peak is an anchor, paired with the next four peaks inside a
63-frame zone. Each pair packs into 24 bits — anchor bin, target bin, time gap:

```
aaaaaaaaa ttttttttt dddddd
└ anchor  └ target  └ Δt
```

A single peak is a coincidence. *This frequency, then that one, 300 ms later* is
a signature.

**4 · Vote.** Matching hashes is not enough — a wrong song shares plenty. What
identifies a track is time coherence: if the snippet really sits at 2:01, every
matching hash agrees on the same offset. Subtract query time from index time,
bucket the differences, and the right answer is a spike out of a flat floor.

The whole vote is one Postgres statement. The query arrives as two integer
arrays, and the same statement returns the ranking, the song metadata and the
alignment histogram together — the round trip costs more than the query does:

```sql
WITH q(hash, qframe) AS (
  SELECT * FROM unnest($1::int[], $2::int[])
),
tally AS (
  SELECT f.song_id,
         (f.anchor_frame - q.qframe) / 2 AS bucket,
         COUNT(*) AS votes
  FROM q JOIN fingerprints f ON f.hash = q.hash
  WHERE f.anchor_frame >= q.qframe
  GROUP BY 1, 2
)
-- then one alignment per song, best first
```

## Measured

Benchmarks live in [`tools/bench`](tools/bench/src).

| degradation | result |
|---|---|
| clean | **100%** (24/24) |
| noise, +20 to +5 dB SNR | **100%** at every step |
| noise, 0 dB SNR | 88% (21/24) |
| mp3 32k / 64k / 96k | **100%** |
| phone band, 300–3400 Hz | **100%** |

**Zero wrong answers across all 288 queries.** Every failure is a refusal, not a
misidentification.

That is what the margin rule buys. Absolute vote counts do not separate a true
match from a false one — the weakest true match scored 78 and the strongest
foreign one 68. What separates them is shape: a true match has one dominant
candidate, while a foreign query scores near-identically against everything
(68, 64, 61). Requiring the leader to be twice the runner-up gives 44/45 recall
with zero false positives.

## Three things measurement changed

**The first index was nearly worthless.** Two narrow bands below 215 Hz produced
32–65% of all peaks, and the most common hash was a bass bin paired with itself
one frame later, 653 times. Only 6.5% of hashes were unique. Starting the bands
at bin 20 and adding the decaying threshold took uniqueness to 32% and dropped
peak foreign votes from 731 to 68.

**A frequency-fuzz parameter did the opposite of its purpose.** It existed to
absorb peak drift under noise. Measured at 0 dB SNR: fuzz 0 recovered 21/24,
fuzz 1 got 17/24, fuzz 2 got 13/24. Removed.

**Dropping data made it more accurate.** 70 hashes — 0.06% of the distinct
total — carry 12% of the index. Skipping any hash with more than 512 postings
cuts query latency from 34 ms to 10 ms *and* improves noise accuracy from 29/36
to 32/36. A hash that appears everywhere identifies nothing while voting for
everyone.

## Stack

TypeScript throughout, in a Bun workspace.

```
packages/core     DSP and matching — FFT, spectrogram, peaks, hashing, scoring
packages/db       the Postgres data layer: schema, ingest and the match query
apps/web          Vue 3 + Vite + Tailwind; fingerprints in a Web Worker
apps/api          Hono on Cloudflare Workers, Postgres over Hyperdrive
tools/ingest      yt-dlp + ffmpeg ingest, CLI and API clients
tools/bench       the benchmarks behind every number above
```

One Cloudflare Worker serves both the API and the static site, so there is no
second origin and no CORS. The database is self-hosted Postgres, reached through
Hyperdrive over a Cloudflare Tunnel so it stays off the public internet.

## Running it

Needs [Bun](https://bun.sh), `ffmpeg` and `yt-dlp`.

```bash
bun install

docker run -d --name chirp-pg -p 55432:5432 \
  -e POSTGRES_USER=chirp -e POSTGRES_PASSWORD=chirp -e POSTGRES_DB=chirp \
  postgres:17-alpine

# fingerprint everything in tracks/ into the local database
bun run tools/ingest/src/cli.ts --reset

# index a track from any URL yt-dlp supports
bun run tools/ingest/src/add.ts "https://youtu.be/…"

# api on :8787, web on :5173
bun run --cwd apps/api dev
bun run --cwd apps/web dev

bun test
```

Spotify and Apple Music URLs are refused by hostname — their audio is
DRM-protected and no extractor reaches it. Ingesting from the source URL means
the video id is known exactly rather than guessed at, so playback seeks to the
audio that was actually fingerprinted.

## Honest limits

- **The noise model is synthetic.** Additive white noise at a known SNR. A real
  room adds reverb and a phone adds its own frequency response; neither is
  modelled. The codec and band-limit numbers should transfer directly, the noise
  numbers are optimistic.
- **A small corpus proves nothing about selectivity.** These numbers come from
  23 tracks. How a 24-bit hash behaves against thousands of songs is untested.
- **Position is only as unique as the audio.** On a repetitive track two points
  can share 41% of their hashes, and under heavy noise the vote can land on the
  wrong repeat. The song is still right.
- **The database is one container on one small machine.** No replica, no
  failover. Identification is a single query on Hyperdrive's free plan, which
  allows 100,000 a day, but the box holds about 250 tracks in page cache before
  queries start reaching disk.
