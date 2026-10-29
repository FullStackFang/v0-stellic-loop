import { configure } from "@testing-library/dom";
import { vi } from "vitest";

// `findBy*` / `waitFor` default to 1 s; a loaded CI runner can miss that.
configure({ asyncUtilTimeout: 3000 });

// `server-only` throws unless the `react-server` export condition is set,
// which Vitest does not do. The guard is a build-time concern, not a test one.
vi.mock("server-only", () => ({}));

// `connection()` needs a live request scope; route-handler tests call GET directly.
// A `vi.fn` so a test can assert the handler awaited it.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => {}),
}));
