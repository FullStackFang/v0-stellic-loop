import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as cron } from "../api/cron/daily/route";
import { GET as magic } from "../m/[token]/route";
import { GET as invite } from "../p/[id]/invite.ics/route";
import { SESSION_COOKIE, sessionSecret, verifySession } from "@/lib/session";
import { hashToken, magicToken } from "@/lib/tokens";
import { openTestDb, type TestDb } from "@/test/db";
import { D, events, world } from "@/test/world";

let t: TestDb;
beforeAll(async () => void (t = await openTestDb()));
afterAll(() => t.close());
beforeEach(() => t.reset());

describe("/m/<token>", () => {
  async function mint(personId: string, expiresIn = 3600_000) {
    const token = magicToken();
    await t.db.query("insert into magic_token (token_hash, person_id, expires_at) values ($1, $2, $3)",
      [hashToken(token), personId, new Date(Date.now() + expiresIn).toISOString()]);
    return token;
  }
  const open = (token: string, qs: string) =>
    magic(new NextRequest(`https://board.test/m/${token}?${qs}`), { params: Promise.resolve({ token }) });

  it("a fresh token sets the cookie, is used up, and lands on the path", async () => {
    const w = await world(t.db);
    const priya = await w.person("Priya");
    const token = await mint(priya.id);
    const res = await open(token, "to=/p/abc&src=on_text");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://board.test/p/abc");
    expect(verifySession(res.cookies.get(SESSION_COOKIE)?.value, sessionSecret())?.person_id).toBe(priya.id);
    expect(res.cookies.get("qe")?.value).toBe("on_text");
    const { rows } = await t.db.query<{ used_at: string | null }>("select used_at from magic_token");
    expect(rows[0].used_at).not.toBeNull();
  });

  it("a used token redirects without a cookie", async () => {
    const w = await world(t.db);
    const token = await mint((await w.person()).id);
    await open(token, "to=/p/abc");
    const res = await open(token, "to=/p/abc");
    expect(res.headers.get("location")).toBe("https://board.test/p/abc");
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("an expired token redirects without a cookie", async () => {
    const w = await world(t.db);
    const token = await mint((await w.person()).id, -1000);
    const res = await open(token, "to=/b/emba27");
    expect(res.headers.get("location")).toBe("https://board.test/b/emba27");
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("an off-origin `to` goes home instead", async () => {
    const w = await world(t.db);
    for (const to of ["https://evil.example/x", "//evil.example/x", "/\\evil.example"]) {
      const token = await mint((await w.person()).id);
      const res = await open(token, `to=${encodeURIComponent(to)}`);
      expect(res.headers.get("location")).toBe("https://board.test/");
    }
  });
});

describe("/p/<id>/invite.ics", () => {
  const get = (id: string) => invite(new Request(`https://board.test/p/${id}/invite.ics`), { params: Promise.resolve({ id }) });

  it("returns the calendar for ON with a day", async () => {
    const w = await world(t.db);
    const pid = await w.proposal((await w.person()).id, { status: "on", on_day: D.tue, on_at: new Date().toISOString(), cost_text: "~$250" });
    const res = await get(pid);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/calendar/);
    const body = await res.text();
    expect(body).toContain("DTSTART;VALUE=DATE:20990216");
    expect(body).toContain(`UID:${pid}`);
  });

  it("404s for open, no-day ON, and unknown ids", async () => {
    const w = await world(t.db);
    const poster = (await w.person()).id;
    const open = await w.proposal(poster);
    const noDay = await w.proposal(poster, { needs_day: false, status: "on", on_at: new Date().toISOString() });
    for (const id of [open, noDay, "nope", "00000000-0000-4000-8000-000000000000"]) expect((await get(id)).status).toBe(404);
  });
});

describe("/api/cron/daily", () => {
  const call = (auth?: string) => cron(new Request("https://board.test/api/cron/daily", { headers: auth ? { authorization: auth } : {} }));

  it("needs the bearer secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
  });

  it("writes one proposal_idled per idled proposal, however often it runs", async () => {
    const w = await world(t.db);
    const poster = (await w.person()).id;
    const idled = await w.proposal(poster, { deadline: "2020-01-01" });
    await w.proposal(poster);                                  // window in 2099: open
    await w.proposal(poster, { needs_day: false });            // open forever
    const ok = `Bearer ${process.env.CRON_SECRET}`;
    expect(await (await call(ok)).json()).toEqual({ idled: 1 });
    expect(await (await call(ok)).json()).toEqual({ idled: 0 });
    expect(await events(t.db, "proposal_idled")).toHaveLength(1);
    expect((await events(t.db, "proposal_idled", idled))).toHaveLength(1);
  });
});
