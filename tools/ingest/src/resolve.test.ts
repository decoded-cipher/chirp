import { describe, expect, test } from "bun:test";
import { licenceOf, rejectEncrypted } from "./resolve";

describe("licenceOf", () => {
  test("reads the code and version out of a CC licence URL", () => {
    expect(licenceOf("http://creativecommons.org/licenses/by-sa/2.5/it/")).toEqual({
      license: "CC-BY-SA-2.5",
      license_url: "http://creativecommons.org/licenses/by-sa/2.5/it/",
    });
  });

  test("distinguishes public domain mark from CC0", () => {
    expect(licenceOf("https://creativecommons.org/publicdomain/mark/1.0/")?.license).toBe("PDM-1.0");
    expect(licenceOf("https://creativecommons.org/publicdomain/zero/1.0/")?.license).toBe("CC0-1.0");
  });

  test("accepts the phrase YouTube reports instead of a URL", () => {
    expect(licenceOf("Creative Commons Attribution license (reuse allowed)")).toEqual({
      license: "CC-BY-3.0",
      license_url: "https://creativecommons.org/licenses/by/3.0/",
    });
  });

  test("treats an absent or unrecognised licence as no licence", () => {
    expect(licenceOf(null)).toBeNull();
    expect(licenceOf(undefined)).toBeNull();
    expect(licenceOf("Standard YouTube License")).toBeNull();
  });
});

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
