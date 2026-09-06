import { describe, expect, test } from "bun:test";
import { rejectEncrypted } from "./resolve";

describe("rejectEncrypted", () => {
  test("refuses services whose audio is DRM-protected", () => {
    expect(() => rejectEncrypted("https://open.spotify.com/track/abc")).toThrow(/Spotify/);
    expect(() => rejectEncrypted("https://music.apple.com/us/album/x/1")).toThrow(/Apple Music/);
  });

  test("ignores a www prefix when matching the host", () => {
    expect(() => rejectEncrypted("https://www.deezer.com/track/1")).toThrow(/Deezer/);
  });

  test("allows sources that serve plain audio", () => {
    expect(() => rejectEncrypted("https://www.youtube.com/watch?v=abc")).not.toThrow();
    expect(() => rejectEncrypted("https://soundcloud.com/a/b")).not.toThrow();
    expect(() => rejectEncrypted("https://archive.org/details/x")).not.toThrow();
  });

  test("rejects input that is not a URL at all", () => {
    expect(() => rejectEncrypted("just some text")).toThrow(/not a URL/);
  });
});
