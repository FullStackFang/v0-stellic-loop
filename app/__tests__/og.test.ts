// @vitest-environment node
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Image from "../b/[slug]/opengraph-image";
import { GET as og } from "../p/[id]/og/route";
import { openTestDb, type TestDb } from "@/test/db";
import { D, world } from "@/test/world";

let t: TestDb;
beforeAll(async () => void (t = await openTestDb()));
afterAll(() => t.close());
beforeEach(() => t.reset());

const PNG = [0x89, 0x50, 0x4e, 0x47];
const bytes = async (r: Response) => new Uint8Array(await r.arrayBuffer());

describe("OG images", () => {
  it("the board image is a PNG with the name only", async () => {
    const w = await world(t.db);
    const res = await Image({ params: Promise.resolve({ slug: w.board.slug }) });
    expect([...(await bytes(res)).slice(0, 4)]).toEqual(PNG);
  });

  it("the proposal image is a PNG, never cached, and changes with the count", async () => {
    const w = await world(t.db);
    const poster = await w.person("Priya");
    const pid = await w.proposal(poster.id, { min_count: 8 });
    const people = [poster, ...(await Promise.all([1, 2, 3, 4].map((i) => w.person(`P${i}`))))];
    for (const p of people) await w.answer(pid, p.id, "in", [D.tue]);
    const get = () => og(new Request(`https://board.test/p/${pid}/og?v=1`), { params: Promise.resolve({ id: pid }) });

    const five = await get();
    expect(five.headers.get("content-type")).toBe("image/png");
    expect(five.headers.get("cache-control")).toMatch(/no-store/);
    const a = await bytes(five);
    expect([...a.slice(0, 4)]).toEqual(PNG);

    await w.answer(pid, (await w.person("Omar")).id, "in", [D.tue]);
    const b = await bytes(await get());
    const hash = (x: Uint8Array) => createHash("sha256").update(x).digest("hex");
    expect(hash(a)).not.toBe(hash(b));
    // the same count renders the same image
    expect(hash(b)).toBe(hash(await bytes(await get())));
  });

  it("404s for an unknown proposal", async () => {
    const res = await og(new Request("https://board.test/p/x/og"), { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(404);
  });
});
