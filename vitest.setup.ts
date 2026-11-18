import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// `server-only` throws unless the `react-server` export condition is set,
// which Vitest does not do. The guard is a build-time concern, not a test one.
vi.mock("server-only", () => ({}));

// Actions read cookies and headers; tests drive them through test/jar.ts.
vi.mock("next/headers", async () => {
  const { cookiesMock, headersMock } = await import("./test/jar");
  return { cookies: async () => cookiesMock(), headers: async () => headersMock() };
});

// The campus screen is the front door by default, which closes the groups site to everyone but the admin. The tests of
// the groups site run with it in front; the campus tests put the campus back with vi.stubEnv('LOOP_FRONT', 'campus').
process.env.LOOP_FRONT ??= "groups";
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-00";
process.env.CRON_SECRET ??= "test-cron";
process.env.NEXT_PUBLIC_APP_URL ??= "https://board.test";
