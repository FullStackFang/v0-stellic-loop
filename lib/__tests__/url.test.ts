import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrl } from "../url";

afterEach(() => vi.unstubAllEnvs());

describe("appUrl", () => {
  it("joins the site address and a path", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://loop.test/");
    expect(appUrl("/a/abc")).toBe("https://loop.test/a/abc");
  });

  // The production setting was saved with spaces after it, and every ask link became an address no page could read.
  it("ignores spaces around the configured address", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "  https://loop.test/    ");
    expect(appUrl("/a/abc")).toBe("https://loop.test/a/abc");
    expect(new URL(appUrl("/a/abc")).pathname).toBe("/a/abc");
  });
});
