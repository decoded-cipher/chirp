export interface Resolved {
  source: string;
  source_id: string;
  title: string;
  artist: string;
  album: string | null;
  duration_s: number;
  source_url: string;
  attribution: string;
  cover_url: string | null;
  youtube_id: string | null;
}

const ENCRYPTED = new Map([
  ["spotify.com", "Spotify"],
  ["open.spotify.com", "Spotify"],
  ["music.apple.com", "Apple Music"],
  ["tidal.com", "Tidal"],
  ["deezer.com", "Deezer"],
  ["music.amazon.com", "Amazon Music"],
]);

export function rejectEncrypted(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    throw new Error(`not a URL: ${url}`);
  }

  const service = ENCRYPTED.get(host);
  if (service) {
    throw new Error(
      `${service} audio is DRM-protected and cannot be ingested. ` +
        `Find the track on YouTube, SoundCloud, Bandcamp or archive.org and use that URL.`,
    );
  }
}

interface Info {
  id: string;
  title: string;
  extractor: string;
  webpage_url: string;
  duration?: number;
  creator?: string;
  artist?: string;
  uploader?: string;
  album?: string;
  track?: string;
  thumbnail?: string;
  _has_drm?: boolean;
}

async function ytdlp(args: string[]): Promise<string> {
  const proc = Bun.spawn(["yt-dlp", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(err.trim().split("\n").pop() ?? `yt-dlp exited ${code}`);
  return out;
}

export async function resolve(url: string): Promise<Resolved> {
  rejectEncrypted(url);

  const info: Info = JSON.parse(await ytdlp(["-J", "--no-warnings", "--socket-timeout", "30", url]));
  if (info._has_drm) throw new Error(`${info.webpage_url} is DRM-protected`);

  const source = info.extractor.toLowerCase();
  const artist = info.creator ?? info.artist ?? info.uploader ?? "Unknown";
  const title = info.track ?? info.title;

  return {
    source,
    source_id: info.id,
    title,
    artist,
    album: info.album ?? null,
    duration_s: info.duration ?? 0,
    source_url: info.webpage_url,
    attribution: `${artist} — ${title}`,
    cover_url: info.thumbnail ?? null,
    youtube_id: source === "youtube" ? info.id : null,
  };
}

export async function download(url: string, into: string, name: string): Promise<string> {
  const out = await ytdlp([
    "-x", "--audio-quality", "0", "--no-warnings", "--no-simulate",
    "--print", "after_move:filepath",
    "-o", `${into}/${name}.%(ext)s`,
    url,
  ]);

  const path = out.trim().split("\n").pop();
  if (!path) throw new Error(`yt-dlp did not report a file for ${url}`);
  return path;
}
