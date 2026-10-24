import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import robots from "../robots";
import { generateMetadata as boardMeta } from "../b/[slug]/page";
import { generateMetadata as proposalMeta } from "../p/[id]/page";
import { openTestDb, type TestDb } from "@/test/db";
import { world } from "@/test/world";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), notFound: vi.fn() }));

let t: TestDb;
beforeAll(async () => void (t = await openTestDb()));
afterAll(() => t.close());
beforeEach(() => t.reset());

describe("boards are unlisted", () => {
  it("robots.txt disallows boards and proposals", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: ["/b/", "/p/"] } });
  });

  it("board and proposal pages say noindex, nofollow", async () => {
    const w = await world(t.db);
    const pid = await w.proposal((await w.person()).id);
    const noindex = { index: false, follow: false };
    expect((await boardMeta({ params: Promise.resolve({ slug: w.board.slug }) })).robots).toEqual(noindex);
    expect((await boardMeta({ params: Promise.resolve({ slug: "nope" }) })).robots).toEqual(noindex);
    expect((await proposalMeta({ params: Promise.resolve({ id: pid }) })).robots).toEqual(noindex);
  });
});
