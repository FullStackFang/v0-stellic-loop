// @vitest-environment node
import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

const matcher = new RegExp("^" + config.matcher[0] + "$");

describe("proxy matcher", () => {
  it("runs on page routes, including slugs that contain a dot-like extension word", () => {
    expect(matcher.test("/l/the-pico")).toBe(true);
    expect(matcher.test("/l/dog-gif")).toBe(true);
    expect(matcher.test("/l/x/me")).toBe(true);
    expect(matcher.test("/org/new")).toBe(true);
    expect(matcher.test("/signin")).toBe(true);
    expect(matcher.test("/auth/confirm")).toBe(true);
  });

  it("skips static assets, the cron routes, and the signed one-tap links", () => {
    expect(matcher.test("/api/cron/reminders")).toBe(false);
    expect(matcher.test("/r/abc.def")).toBe(false);
    expect(matcher.test("/foo.png")).toBe(false);
    expect(matcher.test("/l/x/photo.jpg")).toBe(false);
    expect(matcher.test("/_next/static/chunks/main.js")).toBe(false);
    expect(matcher.test("/_next/image")).toBe(false);
    expect(matcher.test("/favicon.ico")).toBe(false);
  });
});
