import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setFreeDay, setProposalDay } from "../days";
import { addDetail, editProposal } from "../details";
import { closeProposal } from "../lifecycle";

import { post } from "../post";
import { respond } from "../respond";
import { share } from "../share";
import { ENTRY_COOKIE } from "@/lib/events";
import { setNotifier, type Notifier } from "@/lib/notify";
import { respondAs } from "@/lib/ops";
import { boardById, boardData } from "@/lib/load";
import { heat } from "@/lib/quorum";
import { LIMITS, resetLimits } from "@/lib/ratelimit";
import { jar, newDevice, signedIn } from "@/test/jar";
import { enterCode, spyNotifier, type Call } from "@/test/notify";
import { openTestDb, type TestDb } from "@/test/db";
import { D, events, responseOf, world } from "@/test/world";

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

async function heatOf(boardId: string, proposalId: string) {
  const b = (await boardById(t.db, boardId))!;
  const data = await boardData(t.db, b);
  const cells = heat(b, data.responses.filter((r) => r.proposal_id === proposalId), data.conflicts);
  return Object.fromEntries(cells.filter((c) => c.count).map((c) => [c.day, c.count]));
}

describe("posting", () => {
  it("minimal post: needs a day, no minimum, poster in with free days, one proposal_posted", async () => {
    const w = await world(t.db);
    const me = await w.person("Priya");
    await w.free(me.id, [D.mon, D.tue]);
    signedIn(me.id);
    const r = await post({ slug: w.board.slug, title: "Suits in Hoi An" });
    expect(r.status).toBe("ok");
    const id = (r as { proposalId: string }).proposalId;
    const { rows: [p] } = await t.db.query<{ needs_day: boolean; min_count: number | null; title: string; poster_id: string }>(
      "select * from proposal where id = $1", [id]);
    expect(p).toMatchObject({ needs_day: false, min_count: null, title: "Suits in Hoi An", poster_id: me.id });
    expect(await responseOf(t.db, id, me.id)).toEqual({ answer: "in", days: [] });
    expect(await events(t.db, "proposal_posted", id)).toHaveLength(1);
  });

  it("two lines of links make two link details attributed to the poster", async () => {
    const w = await world(t.db);
    const me = await w.person("Priya");
    signedIn(me.id);
    const r = await post({ slug: w.board.slug, title: "Suits", links: "yalycouture.com\nhttps://reddit.com/r/hoian" }) as { proposalId: string };
    const { rows } = await t.db.query<{ kind: string; url: string; added_by: string }>(
      "select kind, url, added_by from proposal_detail where proposal_id = $1 order by url", [r.proposalId]);
    expect(rows).toEqual([]);
  });

  it("a version points at the original and leaves it unchanged", async () => {
    const w = await world(t.db);
    const me = await w.person("Marcus");
    const orig = await w.proposal(me.id, { title: "Overnight boat", cost_text: "~$180", min_count: 10 });
    signedIn(me.id);
    const r = await post({ slug: w.board.slug, title: "Overnight boat", cost: "~$120", min: "10", versionOf: orig }) as { proposalId: string };
    const { rows } = await t.db.query<{ id: string; version_of: string | null; cost_text: string }>(
      "select id, version_of, cost_text from proposal order by created_at");
    expect(rows.find((x) => x.id === r.proposalId)).toMatchObject({ version_of: orig, cost_text: null });
    expect(rows.find((x) => x.id === orig)).toMatchObject({ version_of: null, cost_text: "~$180" });
  });

  it("a stranger is asked for name and number, and the proposal exists only after", async () => {
    const w = await world(t.db);
    expect(await post({ slug: w.board.slug, title: "Night market" })).toMatchObject({ error: "need_identity" });
    expect((await t.db.query("select 1 from proposal")).rows).toHaveLength(0);
    expect(await post({ slug: w.board.slug, title: "Night market", name: "Hana", phone: "607-555-0144" }))
      .toEqual({ status: "needs_code", phone: "+16075550144" });
    expect((await t.db.query("select 1 from proposal")).rows).toHaveLength(0);
    expect((await enterCode(calls, "+16075550144")).status).toBe("ok");
    const { rows } = await t.db.query<{ name: string }>("select pe.name from proposal p join person pe on pe.id = p.poster_id");
    expect(rows).toEqual([{ name: "Hana" }]);
  });

  it("refuses a post with no title before asking anyone to verify", async () => {
    const w = await world(t.db);
    expect(await post({ slug: w.board.slug, title: "  " })).toMatchObject({ error: "need_title" });
  });
});

describe("responding", () => {
  it("change of mind writes one row and a prev → next event", async () => {
    const w = await world(t.db);
    const poster = await w.person();
    const priya = await w.person("Priya");
    const pid = await w.proposal(poster.id);
    signedIn(priya.id);
    await respond({ proposalId: pid, answer: "out" });
    await respond({ proposalId: pid, answer: "in" });
    expect((await responseOf(t.db, pid, priya.id))?.answer).toBe("in");
    const ev = (await events(t.db, "response", pid)).map((e) => e.data);
    expect(ev).toEqual([{ prev: null, next: "out" }, { prev: "out", next: "in" }]);
  });

  it("tapping the current answer clears it", async () => {
    const w = await world(t.db);
    const priya = await w.person("Priya");
    const pid = await w.proposal(priya.id);
    await w.answer(pid, priya.id, "in");
    signedIn(priya.id);
    expect(await respond({ proposalId: pid, answer: "in" })).toMatchObject({ status: "ok", next: null });
    expect(await responseOf(t.db, pid, priya.id)).toBeNull();
  });

  it("the poster can drop and the proposal stays theirs", async () => {
    const w = await world(t.db);
    const me = await w.person("Ken");
    signedIn(me.id);
    const { proposalId } = await post({ slug: w.board.slug, title: "Shirts", needsDay: false }) as { proposalId: string };
    await respond({ proposalId, answer: "out" });
    const { rows } = await t.db.query<{ poster_id: string }>("select poster_id from proposal where id = $1", [proposalId]);
    expect(rows[0].poster_id).toBe(me.id);
    expect((await responseOf(t.db, proposalId, me.id))?.answer).toBe("out");
  });

  it("tap-in attaches free days", async () => {
    const w = await world(t.db);
    const priya = await w.person("Priya");
    await w.free(priya.id, [D.mon, D.tue, D.thu, D.fri]);
    const boat = await w.proposal((await w.person()).id, { title: "Overnight boat" });
    signedIn(priya.id);
    await respond({ proposalId: boat, answer: "in" });
    expect((await responseOf(t.db, boat, priya.id))?.days).toEqual([D.mon, D.tue, D.thu, D.fri]);
  });

  it("a day you're ON for elsewhere is removed and explained", async () => {
    const w = await world(t.db);
    const priya = await w.person("Priya");
    await w.free(priya.id, [D.mon, D.tue]);
    const suits = await w.proposal(priya.id, { title: "Suits in Hoi An", status: "on", on_day: D.tue, on_at: new Date().toISOString() });
    await w.answer(suits, priya.id, "in", [D.tue]);
    const boat = await w.proposal(priya.id, { title: "Overnight boat" });
    signedIn(priya.id);
    const r = await respond({ proposalId: boat, answer: "in" });
    expect(r).toMatchObject({ status: "ok", days: [D.mon], conflict: { day: D.tue, title: "Suits in Hoi An" } });
  });

  it("maybe on a no-day proposal attaches nothing; maybes never count", async () => {
    const w = await world(t.db);
    const poster = await w.person();
    const pid = await w.proposal(poster.id, { needs_day: false });
    for (let i = 0; i < 3; i++) await w.answer(pid, (await w.person()).id, "in");
    for (let i = 0; i < 5; i++) await w.answer(pid, (await w.person()).id, "maybe");
    signedIn(poster.id);
    expect((await t.db.query("select status from proposal where id = $1", [pid])).rows[0]).toMatchObject({status:"open"});
    await respond({ proposalId: pid, answer: "out" });
    expect(await respond({ proposalId: pid, answer: "in" })).toMatchObject({ status: "ok" });
  });

  it("a drop after ON tells the poster only, and the proposal stays on", async () => {
    const w = await world(t.db);
    const josh = await w.person("Josh");
    const marcus = await w.person("Marcus");
    const pid = await w.proposal(josh.id, { status: "on", on_day: D.thu, on_at: new Date().toISOString(), min_count: 8 });
    await w.answer(pid, josh.id, "in");
    await w.answer(pid, marcus.id, "in");
    for (let i = 0; i < 6; i++) await w.answer(pid, (await w.person()).id, "in");
    signedIn(marcus.id);
    await respond({ proposalId: pid, answer: "out" });
    const dropped = calls.filter((c) => c.kind === "dropped");
    expect(dropped).toHaveLength(1);
    expect(dropped[0].msg).toMatchObject({ to: josh.id, who: marcus.id, count: 7 });
    const { rows } = await t.db.query<{ status: string }>("select status from proposal where id = $1", [pid]);
    expect(rows[0].status).toBe("on");
  });
});

describe("free days", () => {
  it("marking a day free lifts heat on every open proposal you're in on", async () => {
    const w = await world(t.db);
    const priya = await w.person("Priya");
    const suits = await w.proposal(priya.id);
    const boat = await w.proposal(priya.id, { title: "Boat" });
    await w.answer(suits, priya.id, "in", [D.mon]);
    await w.answer(boat, priya.id, "in", [D.mon]);
    signedIn(priya.id);
    expect(await setFreeDay({ boardId: w.board.id, day: D.sun, free: true })).toEqual({ status: "ok" });
    expect(await heatOf(w.board.id, suits)).toEqual({ [D.sun]: 1, [D.mon]: 1 });
    expect(await heatOf(w.board.id, boat)).toEqual({ [D.sun]: 1, [D.mon]: 1 });
  });

  it("keeps attached days in window order when a day is added", async () => {
    const w = await world(t.db);
    const priya = await w.person("Priya");
    const suits = await w.proposal(priya.id);
    await w.answer(suits, priya.id, "in", [D.mon, D.thu]);
    signedIn(priya.id);
    await setFreeDay({ boardId: w.board.id, day: D.sun, free: true });
    await setProposalDay({ proposalId: suits, day: D.tue, on: true });
    expect((await responseOf(t.db, suits, priya.id))?.days).toEqual([D.sun, D.mon, D.tue, D.thu]);
  });

  it("an ON proposal is untouched", async () => {
    const w = await world(t.db);
    const priya = await w.person("Priya");
    await w.free(priya.id, [D.thu]);
    const flight = await w.proposal(priya.id, { status: "on", on_day: D.thu, on_at: new Date().toISOString() });
    await w.answer(flight, priya.id, "in", [D.thu]);
    signedIn(priya.id);
    await setFreeDay({ boardId: w.board.id, day: D.thu, free: false });
    expect(await responseOf(t.db, flight, priya.id)).toEqual({ answer: "in", days: [D.thu] });
    const { rows } = await t.db.query<{ on_day: string }>("select on_day from proposal where id = $1", [flight]);
    expect(rows[0].on_day).toBe(D.thu);
  });

  it("per-proposal adjustment leaves free days alone", async () => {
    const w = await world(t.db);
    const priya = await w.person("Priya");
    await w.free(priya.id, [D.mon, D.tue]);
    const suits = await w.proposal(priya.id);
    const boat = await w.proposal(priya.id, { title: "Boat" });
    await w.answer(suits, priya.id, "in", [D.mon, D.tue]);
    await w.answer(boat, priya.id, "in", [D.mon, D.tue]);
    signedIn(priya.id);
    await setProposalDay({ proposalId: boat, day: D.mon, on: false });
    expect(await heatOf(w.board.id, boat)).toEqual({ [D.tue]: 1 });
    expect(await heatOf(w.board.id, suits)).toEqual({ [D.mon]: 1, [D.tue]: 1 });
    const { rows } = await t.db.query<{ day: string }>("select day from free_day where person_id = $1 order by day", [priya.id]);
    expect(rows.map((r) => r.day)).toEqual([D.mon, D.tue]);
  });

  it("refuses a day outside the window", async () => {
    const w = await world(t.db);
    signedIn((await w.person()).id);
    expect(await setFreeDay({ boardId: w.board.id, day: "2099-03-01", free: true })).toMatchObject({ error: "bad_day" });
  });
});

describe("details", () => {
  it("anyone in adds a link, attributed, with detail_added", async () => {
    const w = await world(t.db);
    const priya = await w.person("Priya");
    const marcus = await w.person("Marcus");
    const pid = await w.proposal(priya.id);
    await w.answer(pid, marcus.id, "in");
    signedIn(marcus.id);
    expect(await addDetail({ proposalId: pid, text: "reddit.com/r/hoian" })).toEqual({ status: "ok", kind: "link" });
    expect(await addDetail({ proposalId: pid, text: "Bring a photo of a suit you like." })).toEqual({ status: "ok", kind: "note" });
    expect(await addDetail({ proposalId: pid, text: "https://maps.google.com/?q=Yaly" })).toEqual({ status: "ok", kind: "where" });
    const { rows } = await t.db.query<{ added_by: string }>("select added_by from proposal_detail where proposal_id = $1", [pid]);
    expect(rows.every((r) => r.added_by === marcus.id)).toBe(true);
    expect(await events(t.db, "detail_added", pid)).toHaveLength(3);
    expect(calls).toHaveLength(0);
  });

  it("a maybe cannot add", async () => {
    const w = await world(t.db);
    const hana = await w.person("Hana");
    const pid = await w.proposal((await w.person()).id);
    await w.answer(pid, hana.id, "maybe");
    signedIn(hana.id);
    expect(await addDetail({ proposalId: pid, text: "a note" })).toMatchObject({ error: "not_in" });
  });

  it("the poster edits detail and time; title, number and cost are fixed; others cannot edit", async () => {
    const w = await world(t.db);
    const priya = await w.person("Priya");
    const pid = await w.proposal(priya.id);
    signedIn(priya.id);
    expect(await editProposal({ proposalId: pid, place: "Two fittings", time: "3:00pm" })).toEqual({ status: "ok" });
    expect(await editProposal({ proposalId: pid, title: "New" })).toMatchObject({ error: "fixed" });
    expect(await editProposal({ proposalId: pid, min: 3 })).toMatchObject({ error: "fixed" });
    expect(await editProposal({ proposalId: pid, cost: "$1" })).toMatchObject({ error: "fixed" });
    signedIn((await w.person()).id);
    expect(await editProposal({ proposalId: pid, place: "x" })).toMatchObject({ error: "not_poster" });
    const { rows } = await t.db.query("select place, time_text, title from proposal where id = $1", [pid]);
    expect(rows[0]).toEqual({ place: "Two fittings", time_text: "3:00pm", title: "Suits in Hoi An" });
  });
});

describe("lifecycle", () => {
  it("the poster closes; others cannot", async () => {
    const w = await world(t.db);
    const me = await w.person();
    const pid = await w.proposal(me.id);
    signedIn((await w.person()).id);
    expect(await closeProposal({ proposalId: pid })).toMatchObject({ error: "not_poster" });
    signedIn(me.id);
    expect(await closeProposal({ proposalId: pid })).toEqual({ status: "ok" });
    expect(await events(t.db, "proposal_closed", pid)).toHaveLength(1);
  });
});

describe("share", () => {
  it("every tap mints a fresh URL and a share row naming the sharer", async () => {
    const w = await world(t.db);
    const priya = await w.person("Priya");
    const pid = await w.proposal(priya.id);
    signedIn(priya.id);
    const a = await share({ proposalId: pid }) as { url: string };
    const b = await share({ proposalId: pid }) as { url: string };
    expect(a.url).not.toBe(b.url);
    expect(a.url).toMatch(new RegExp(`/p/${pid}\\?s=[0-9A-Za-z]{10}$`));
    const { rows } = await t.db.query("select sharer_id from share where proposal_id = $1", [pid]);
    expect(rows).toEqual([{ sharer_id: priya.id }, { sharer_id: priya.id }]);
    expect(await events(t.db, "share_minted", pid)).toHaveLength(2);
  });

  it("a stranger arriving by a share is attributed to it", async () => {
    const w = await world(t.db);
    const priya = await w.person("Priya");
    const pid = await w.proposal(priya.id);
    signedIn(priya.id);
    const { url } = await share({ proposalId: pid }) as { url: string };
    const token = new URL(url).searchParams.get("s");
    const { rows: [s] } = await t.db.query<{ id: string }>("select id from share where token = $1", [token]);

    newDevice();
    jar.cookies.set(ENTRY_COOKIE, `proposal_link:${token}`);
    await respond({ proposalId: pid, answer: "in", name: "Omar", phone: "607-555-0188" });
    await enterCode(calls, "+16075550188");
    const resp = (await events(t.db, "response", pid)).at(-1)!;
    const added = (await events(t.db, "person_added", pid)).at(-1)!;
    expect(resp).toMatchObject({ source: "proposal_link", share_id: s.id });
    expect(added).toMatchObject({ source: "proposal_link", share_id: s.id });
  });

  it("the board link is group_link", async () => {
    const w = await world(t.db);
    const pid = await w.proposal((await w.person()).id);
    jar.cookies.set(ENTRY_COOKIE, "group_link");
    await respond({ proposalId: pid, answer: "in", name: "Omar", phone: "607-555-0188" });
    await enterCode(calls, "+16075550188");
    expect((await events(t.db, "response", pid))[0]).toMatchObject({ source: "group_link", share_id: null });
  });

  it(`allows ${LIMITS.share.perIp} shares a minute from one address, then refuses`, async () => {
    const w = await world(t.db);
    const pid = await w.proposal((await w.person()).id);
    for (let i = 0; i < LIMITS.share.perIp; i++) expect((await share({ proposalId: pid })).status).toBe("ok");
    expect(await share({ proposalId: pid })).toMatchObject({ error: "rate_limited" });
  });
});

describe("one more", () => {
  /** An open no-day intent with `ins` yeses already (the poster first). */
  async function close(min: number | null, ins: number) {
    const w = await world(t.db);
    const poster = await w.person("Poster");
    const pid = await w.proposal(poster.id, { needs_day: false, min_count: min });
    const yes = [poster];
    if (ins > 0) await w.answer(pid, poster.id, "in");
    for (let i = 1; i < ins; i++) {
      const p = await w.person();
      await w.answer(pid, p.id, "in");
      yes.push(p);
    }
    return { w, poster, pid, yes };
  }
  const oneMores = () => calls.filter((c) => c.kind === "oneMore");

  it("the sixth of eight fires once, to the poster and every yes, each with a share of their own; the seventh sends nothing", async () => {
    const { w, pid, yes } = await close(8, 5);
    const sixth = await w.person("Sixth");
    signedIn(sixth.id);
    expect((await respond({ proposalId: pid, answer: "in" })).status).toBe("ok");
    expect(await events(t.db, "one_more_sent", pid)).toHaveLength(1);
    expect(oneMores()).toHaveLength(1);
    const msg = oneMores()[0].msg as { count: number; min: number; to: { personId: string; url: string }[] };
    expect(msg).toMatchObject({ count: 6, min: 8 });
    expect(msg.to.map((r) => r.personId).sort()).toEqual([...yes, sixth].map((p) => p.id).sort());
    for (const r of msg.to) expect(r.url).toMatch(new RegExp(`^https://board\\.test/p/${pid}\\?s=[0-9A-Za-z]{10}$`));
    const shares = await events(t.db, "share_minted", pid);
    expect(shares.map((e) => e.person_id).sort()).toEqual(msg.to.map((r) => r.personId).sort());

    const seventh = await w.person("Seventh");
    signedIn(seventh.id);
    await respond({ proposalId: pid, answer: "in" });
    expect(oneMores()).toHaveLength(1);
    expect(await events(t.db, "one_more_sent", pid)).toHaveLength(1);
  });

  it("the poster alone on a default-4 intent sends nothing; the second in does", async () => {
    const { w, poster, pid } = await close(null, 0);
    signedIn(poster.id);
    await respond({ proposalId: pid, answer: "in" });
    expect(oneMores()).toHaveLength(0);
    signedIn((await w.person()).id);
    await respond({ proposalId: pid, answer: "in" });
    expect(oneMores()).toHaveLength(1);
    expect(oneMores()[0].msg).toMatchObject({ count: 2, min: 4 });
  });

  it("two yeses that both qualify at once fire it once", async () => {
    const { w, pid } = await close(8, 5);
    const [a, b] = [await w.person(), await w.person()];
    const direct = { source: "direct" as const, shareId: null };
    const got = await Promise.all([a, b].map((p) => t.db.tx((q) => respondAs(q, p.id, pid, "in", direct))));
    expect(got.filter((r) => r.status === "ok" && r.oneMore)).toHaveLength(1);
    expect(await events(t.db, "one_more_sent", pid)).toHaveLength(1);
  });

  it("maybe and out never fire it", async () => {
    const { w, pid } = await close(8, 5);
    signedIn((await w.person()).id);
    await respond({ proposalId: pid, answer: "out" });
    signedIn((await w.person()).id);
    await respond({ proposalId: pid, answer: "out" });
    expect(oneMores()).toHaveLength(0);
    expect(await events(t.db, "one_more_sent", pid)).toHaveLength(0);
  });
});

describe("follow-up texts never block the action", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function ready() {
    const w = await world(t.db);
    const people = [await w.person("A"), await w.person("B"), await w.person("C")];
    const pid = await w.proposal(people[0].id, { min_count: 3 });
    for (const p of people) await w.answer(pid, p.id, "in", [D.tue]);
    await w.answer(pid, (await w.person("Hana")).id, "maybe");
    return { people, pid };
  }
  const status = async (pid: string) =>
    (await t.db.query<{ status: string }>("select status from proposal where id = $1", [pid])).rows[0].status;

  it("a notifier that throws is swallowed", async () => {
    const boom = async () => { throw new Error("boom"); };
    setNotifier(() => ({ onReached: boom, oneMore: boom, maybeNudge: boom, dropped: boom, code: boom }) as unknown as Notifier);
    const { people, pid } = await ready();
    signedIn(people[0].id);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await t.db.query("delete from response where proposal_id = $1 and person_id = $2", [pid, people[0].id]);
    await t.db.query("insert into free_day (board_id, person_id, day) select board_id, $2, $3 from proposal where id = $1", [pid, people[0].id, D.tue]);
    expect(await respond({ proposalId: pid, answer: "in" })).toMatchObject({ status: "ok" });
    expect(err).toHaveBeenCalledOnce();
    err.mockRestore();
    expect(await status(pid)).toBe("on");
  });
});
