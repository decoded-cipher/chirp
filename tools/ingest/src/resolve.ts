export interface Resolved {
  source: string;
  source_id: string;
  title: string;
  artist: string;
  album: string | null;
  duration_s: number;
  source_url: string;
  license: string;
  license_url: string | null;
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

const CC_PATH = /creativecommons\.org\/licenses\/([a-z-]+)\/([0-9.]+)/i;
const PD_PATH = /creativecommons\.org\/publicdomain\/(mark|zero)\/([0-9.]+)/i;

export function licenceOf(raw: string | null | undefined): { license: string; license_url: string | null } | null {
  if (!raw) return null;

  const cc = CC_PATH.exec(raw);
  if (cc) return { license: `CC-${cc[1]!.toUpperCase()}-${cc[2]}`, license_url: raw };

  const pd = PD_PATH.exec(raw);
  if (pd) {
    return { license: pd[1] === "zero" ? `CC0-${pd[2]}` : `PDM-${pd[2]}`, license_url: raw };
  }

  // YouTube reports a phrase, not a URL.
  if (/creative commons/i.test(raw)) {
    return { license: "CC-BY-3.0", license_url: "https://creativecommons.org/licenses/by/3.0/" };
  }

  return null;
}

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
  license?: string;
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

export async function resolve(url: string, anyLicence: boolean): Promise<Resolved> {
  rejectEncrypted(url);

  const info: Info = JSON.parse(await ytdlp(["-J", "--no-warnings", "--socket-timeout", "30", url]));
  if (info._has_drm) throw new Error(`${info.webpage_url} is DRM-protected`);

  const licence = licenceOf(info.license);
  if (!licence && !anyLicence) {
    throw new Error(
      `no reusable licence declared on ${info.webpage_url}. ` +
        `Pass --any-license to index it anyway.`,
    );
  }

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
    license: licence?.license ?? "unknown",
    license_url: licence?.license_url ?? null,
    attribution: `${artist} — ${title}${licence ? ` (${licence.license})` : ""}`,
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
