// Starting boards and rolling windows, through the actions, on a real database.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as cron } from "@/app/api/cron/daily/route";
import { startBoard } from "../board";
import { setFreeDay, setProposalDay } from "../days";
import { reopenProposal } from "../lifecycle";
import { post } from "../post";
import { respond } from "../respond";
import { verifyCode } from "../verifyCode";
import { addDays, todayIn } from "@/lib/days";
import { allocateBoard } from "@/lib/slug";
import { resetLimits } from "@/lib/ratelimit";
import { SESSION_COOKIE } from "@/lib/session";
import { jar, newDevice, signedIn } from "@/test/jar";
import { enterCode, spyNotifier, type Call } from "@/test/notify";
import { makeBoard, makePerson, openTestDb, type TestDb } from "@/test/db";
import { events, responseOf } from "@/test/world";

let t: TestDb;
let calls: Call[];
beforeAll(async () => void (t = await openTestDb()));
afterAll(() => t.close());
beforeEach(async () => {
  await t.reset();
  resetLimits();
  calls = spyNotifier();
  newDevice();
});

const today = () => todayIn("America/New_York");

async function rolling(slug = "r" + Math.random().toString(36).slice(2, 8)) {
  const { rows } = await t.db.query<{ id: string; slug: string }>(
    "insert into board (slug, name, window_kind) values ($1, 'Strategy team', 'rolling') returning id, slug", [slug]);
  return rows[0];
}
async function member(boardId: string, name = "P") {
  const p = await makePerson(t.db, name);
  await t.db.query("insert into board_person (board_id, person_id, joined_via) values ($1, $2, 'seed')", [boardId, p.id]);
  return p;
}
const proposalRow = async (id: string) =>
  (await t.db.query<{ min_count: number | null; deadline: string | null; status: string }>(
    "select min_count, deadline, status from proposal where id = $1", [id])).rows[0];

describe("posting on a rolling board", () => {
  it("a needs-a-day post gets the implied deadline: today plus 13", async () => {
    const b = await rolling();
    signedIn((await member(b.id, "Marcus")).id);
    const r = await post({ slug: b.slug, title: "Room after class Thu" }) as { proposalId: string };
    expect((await proposalRow(r.proposalId)).deadline).toBe(addDays(today(), 13));
  });

  it("a no-day post keeps no deadline", async () => {
    const b = await rolling();
    signedIn((await member(b.id)).id);
    const r = await post({ slug: b.slug, title: "Club hoodies", needsDay: false }) as { proposalId: string };
    expect((await proposalRow(r.proposalId)).deadline).toBeNull();
  });

  it("a fixed board before its window is unchanged: no deadline", async () => {
    const b = await makeBoard(t.db);
    signedIn((await member(b.id)).id);
    const r = await post({ slug: b.slug, title: "Boat" }) as { proposalId: string };
    expect((await proposalRow(r.proposalId)).deadline).toBeNull();
  });

  it("a fixed board whose dates are over refuses a needs-a-day post and creates nothing", async () => {
    const b = await makeBoard(t.db, { window_start: "2020-03-01", window_end: "2020-03-07" });
    signedIn((await member(b.id)).id);
    expect(await post({ slug: b.slug, title: "Boat" })).toMatchObject({ error: "dates_over", message: "This board's dates are over." });
    newDevice();
    expect(await post({ slug: b.slug, title: "Boat", name: "Stranger", phone: "+16075550999" })).toMatchObject({ error: "dates_over" });
    expect((await t.db.query("select 1 from proposal")).rows).toHaveLength(0);
    expect((await t.db.query("select 1 from person where phone = '+16075550999'")).rows).toHaveLength(0);
    // a no-day intent still goes up
    signedIn((await member(b.id)).id);
    expect((await post({ slug: b.slug, title: "Reunion dinner", needsDay: false })).status).toBe("ok");
  });
});

describe("days on a rolling board", () => {
  it("free days: today and day 14 can be marked; yesterday and day 15 cannot", async () => {
    const b = await rolling();
    signedIn((await member(b.id)).id);
    expect(await setFreeDay({ boardId: b.id, day: today(), free: true })).toEqual({ status: "ok" });
    expect(await setFreeDay({ boardId: b.id, day: addDays(today(), 13), free: true })).toEqual({ status: "ok" });
    expect(await setFreeDay({ boardId: b.id, day: addDays(today(), -1), free: true })).toMatchObject({ error: "bad_day" });
    expect(await setFreeDay({ boardId: b.id, day: addDays(today(), 14), free: true })).toMatchObject({ error: "bad_day" });
  });

  it("a proposal's days: yesterday and day 15 are refused", async () => {
    const b = await rolling();
    const me = await member(b.id);
    signedIn(me.id);
    const r = await post({ slug: b.slug, title: "Case prep Sunday" }) as { proposalId: string };
    expect(await setProposalDay({ proposalId: r.proposalId, day: addDays(today(), 2), on: true })).toEqual({ status: "ok" });
    expect(await setProposalDay({ proposalId: r.proposalId, day: addDays(today(), -1), on: true })).toMatchObject({ error: "bad_day" });
    expect(await setProposalDay({ proposalId: r.proposalId, day: addDays(today(), 14), on: true })).toMatchObject({ error: "bad_day" });
  });

  it("yesterday's free day is kept but not attached on tap-in", async () => {
    const b = await rolling();
    const poster = await member(b.id, "Marcus");
    const priya = await member(b.id, "Priya");
    const yesterday = addDays(today(), -1), soon = addDays(today(), 2);
    await t.db.query("insert into free_day (board_id, person_id, day) values ($1, $2, $3), ($1, $2, $4)", [b.id, priya.id, yesterday, soon]);
    signedIn(poster.id);
    const r = await post({ slug: b.slug, title: "Room after class Thu" }) as { proposalId: string };
    signedIn(priya.id);
    expect(await respond({ proposalId: r.proposalId, answer: "in" })).toMatchObject({ status: "ok", days: [soon] });
    expect(await responseOf(t.db, r.proposalId, priya.id)).toEqual({ answer: "in", days: [soon] });
    expect((await t.db.query("select 1 from free_day where person_id = $1", [priya.id])).rows).toHaveLength(2);
  });
});

describe("reopen", () => {
  it("on a rolling board: the same minimum, deadline to the end of the current window, nothing sent", async () => {
    const b = await rolling();
    const me = await member(b.id, "Marcus");
    const { rows: [{ id }] } = await t.db.query<{ id: string }>(
      "insert into proposal (board_id, poster_id, title, min_count, deadline) values ($1, $2, 'Case prep Sunday', 4, '2020-01-01') returning id", [b.id, me.id]);
    signedIn(me.id);
    expect(await reopenProposal({ proposalId: id, min: 5 })).toMatchObject({ error: "not_higher" });
    expect(await reopenProposal({ proposalId: id, min: 4 })).toEqual({ status: "ok" });
    expect(await proposalRow(id)).toEqual({ min_count: 4, deadline: addDays(today(), 13), status: "open" });
    expect(await events(t.db, "proposal_reopened", id)).toHaveLength(1);
    expect(calls).toHaveLength(0);
  });

  it("on a fixed board: lower only, and refused once the window is over", async () => {
    const live = await makeBoard(t.db);
    const me = await member(live.id);
    const { rows: [{ id }] } = await t.db.query<{ id: string }>(
      "insert into proposal (board_id, poster_id, title, min_count, deadline) values ($1, $2, 'Boat', 6, '2020-01-01') returning id", [live.id, me.id]);
    signedIn(me.id);
    expect(await reopenProposal({ proposalId: id, min: 6 })).toMatchObject({ error: "not_lower" });

    const over = await makeBoard(t.db, { window_start: "2020-03-01", window_end: "2020-03-07" });
    const { rows: [{ id: old }] } = await t.db.query<{ id: string }>(
      "insert into proposal (board_id, poster_id, title, min_count) values ($1, $2, 'Boat', 6) returning id", [over.id, me.id]);
    expect(await reopenProposal({ proposalId: old, min: 4 })).toMatchObject({ error: "window_over" });
  });
});

describe("the daily job on a rolling board", () => {
  it("implied deadlines idle once per proposal, however often it runs", async () => {
    const b = await rolling();
    const me = await member(b.id);
    const ids: string[] = [];
    for (const [title, deadline] of [["Gone", addDays(today(), -1)], ["Also gone", addDays(today(), -3)], ["Live", addDays(today(), 5)]]) {
      const { rows } = await t.db.query<{ id: string }>(
        "insert into proposal (board_id, poster_id, title, deadline) values ($1, $2, $3, $4) returning id", [b.id, me.id, title, deadline]);
      ids.push(rows[0].id);
    }
    const call = () => cron(new Request("https://board.test/api/cron/daily", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    expect(await (await call()).json()).toEqual({ idled: 2 });
    expect(await (await call()).json()).toEqual({ idled: 0 });
    expect(await events(t.db, "proposal_idled", ids[0])).toHaveLength(1);
    expect(await events(t.db, "proposal_idled", ids[1])).toHaveLength(1);
    expect(await events(t.db, "proposal_idled", ids[2])).toHaveLength(0);
  });
});

describe("starting a board", () => {
  const boards = async () =>
    (await t.db.query<{ id: string; slug: string; name: string; tz: string; window_kind: string; window_start: string | null }>(
      "select id, slug, name, tz, window_kind, window_start from board order by created_at, slug")).rows;

  it("a new number: rolling board in their timezone, signed in, on the roster, one board_created", async () => {
    const r = await startBoard({ board: "Strategy team", tz: "America/Chicago", name: "Priya", phone: "(607) 555-0123" });
    expect(r).toEqual({ status: "needs_code", phone: "+16075550123" });
    expect(await boards()).toHaveLength(0);
    expect(await enterCode(calls, "+16075550123")).toEqual({ status: "ok", path: "/b/strategy-team" });
    const [b] = await boards();
    expect(b).toMatchObject({ slug: "strategy-team", name: "Strategy team", tz: "America/Chicago", window_kind: "rolling", window_start: null });
    const { rows: [priya] } = await t.db.query<{ id: string }>("select id from person where phone = '+16075550123'");
    expect(jar.cookies.get(SESSION_COOKIE)).toBeTruthy();
    expect((await t.db.query("select 1 from board_person where board_id = $1 and person_id = $2", [b.id, priya.id])).rows).toHaveLength(1);
    expect(await events(t.db, "board_created")).toEqual([{ person_id: priya.id, source: "direct", share_id: null, data: { window: "rolling" } }]);
  });

  it("is attributed direct even when the visit came by a group link", async () => {
    jar.cookies.set("qe", "group_link");
    await startBoard({ board: "Ski Club '26!", tz: "America/New_York", name: "Dana", phone: "+16075550124" });
    await enterCode(calls, "+16075550124");
    expect((await boards())[0].slug).toBe("ski-club-26");
    expect((await events(t.db, "board_created"))[0].source).toBe("direct");
  });

  it("a bad timezone falls back to New York", async () => {
    await startBoard({ board: "Mars base", tz: "Mars/Olympus", name: "Elon", phone: "+16075550125" });
    await enterCode(calls, "+16075550125");
    expect((await boards())[0].tz).toBe("America/New_York");
  });

  it("needs a name and asks a stranger who they are", async () => {
    expect(await startBoard({ board: "  ", tz: "America/New_York" })).toMatchObject({ error: "need_board_name" });
    expect(await startBoard({ board: "Strategy team", tz: "America/New_York" })).toMatchObject({ error: "need_identity" });
    expect(await boards()).toHaveLength(0);
  });

  it("the fourth board from one number within an hour is refused, on any instance", async () => {
    const me = await makePerson(t.db, "Priya");
    signedIn(me.id);
    for (const n of [1, 2, 3]) {
      resetLimits(); // a different server instance each time
      expect((await startBoard({ board: `Team ${n}`, tz: "America/New_York" })).status).toBe("ok");
    }
    resetLimits();
    expect(await startBoard({ board: "Team 4", tz: "America/New_York" })).toMatchObject({
      error: "too_many_boards", message: "Too many new boards. Try again in an hour.",
    });
    expect(await boards()).toHaveLength(3);
  });

  it("a known number on a new device starts the board through the code", async () => {
    const priya = await makePerson(t.db, "Priya", { phone: "+16075550123" });
    newDevice();
    expect(await startBoard({ board: "Strategy team", tz: "America/Denver", name: "Priya", phone: "607 555 0123" }))
      .toEqual({ status: "needs_code", phone: "+16075550123" });
    expect(await boards()).toHaveLength(0);
    const code = calls.find((c) => c.kind === "code")!.msg;
    expect(code.boardId).toBeNull();
    expect((await events(t.db, "text_sent"))).toHaveLength(1);
    expect(await verifyCode({ phone: "+16075550123", code: code.code as string })).toEqual({ status: "ok", path: "/b/strategy-team" });
    const [b] = await boards();
    expect(b).toMatchObject({ slug: "strategy-team", tz: "America/Denver", window_kind: "rolling" });
    expect((await events(t.db, "board_created"))[0].person_id).toBe(priya.id);
  });
});

describe("slugs", () => {
  it("strategy-team and strategy-team-building taken: the next Strategy team is strategy-team-2", async () => {
    await rolling("strategy-team");
    await rolling("strategy-team-building");
    signedIn((await makePerson(t.db)).id);
    expect(await startBoard({ board: "Strategy team", tz: "America/New_York" })).toEqual({ status: "ok", slug: "strategy-team-2" });
  });

  it("starts past the highest suffix", async () => {
    for (const s of ["book-club", "book-club-2", "book-club-7"]) await rolling(s);
    expect((await allocateBoard(t.db, "book-club", { name: "Book club", tz: "America/New_York" })).slug).toBe("book-club-8");
  });

  it("two concurrent starts of the same name both succeed", async () => {
    const a = await makePerson(t.db, "A");
    const b = await makePerson(t.db, "B");
    signedIn(a.id);
    const first = startBoard({ board: "Strategy team", tz: "America/New_York" });
    signedIn(b.id);
    const second = startBoard({ board: "Strategy team", tz: "America/New_York" });
    const got = await Promise.all([first, second]);
    expect(got.map((r) => r.status)).toEqual(["ok", "ok"]);
    expect(got.map((r) => (r as { slug: string }).slug).sort()).toEqual(["strategy-team", "strategy-team-2"]);
  });
});
