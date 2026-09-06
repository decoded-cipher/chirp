import { SAMPLE_RATE } from "@chirp/core";

// `-ac 1` averages channels, matching OfflineAudioContext; diverging breaks cross-path matching.
export async function decode(path: string, from = 0, duration?: number): Promise<Float32Array> {
  const args = ["-v", "error"];
  if (from > 0) args.push("-ss", String(from));
  if (duration !== undefined) args.push("-t", String(duration));
  args.push("-i", path, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "-");

  const proc = Bun.spawn(["ffmpeg", ...args], { stdout: "pipe", stderr: "pipe" });
  const [buffer, stderr, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (code !== 0) throw new Error(`ffmpeg failed on ${path}: ${stderr.trim()}`);
  return new Float32Array(buffer);
}

export async function probe(path: string): Promise<{ sample_rate: number; channels: number }> {
  const proc = Bun.spawn([
    "ffprobe", "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=sample_rate,channels", "-of", "json", path,
  ], { stdout: "pipe", stderr: "pipe" });

  const [out, code] = await Promise.all([new Response(proc.stdout).json(), proc.exited]);
  if (code !== 0) throw new Error(`ffprobe failed on ${path}`);

  const stream = (out as { streams?: { sample_rate?: string; channels?: number }[] }).streams?.[0];
  return { sample_rate: Number(stream?.sample_rate ?? 0), channels: stream?.channels ?? 0 };
}
