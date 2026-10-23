import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setFreeDay, setProposalDay } from "../days";
import { addDetail, editProposal } from "../details";
import { closeProposal, reopenProposal } from "../lifecycle";
import { lock } from "../lock";
import { post } from "../post";
import { respond } from "../respond";
import { share } from "../share";
import { ENTRY_COOKIE } from "@/lib/events";
import { boardById, boardData } from "@/lib/load";
import { heat } from "@/lib/quorum";
import { LIMITS, resetLimits } from "@/lib/ratelimit";
import { jar, newDevice, signedIn } from "@/test/jar";
import { spyNotifier, type Call } from "@/test/notify";
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
    expect(p).toMatchObject({ needs_day: true, min_count: null, title: "Suits in Hoi An", poster_id: me.id });
    expect(await responseOf(t.db, id, me.id)).toEqual({ answer: "in", days: [D.mon, D.tue] });
    expect(await events(t.db, "proposal_posted", id)).toHaveLength(1);
  });

  it("two lines of links make two link details attributed to the poster", async () => {
    const w = await world(t.db);
    const me = await w.person("Priya");
    signedIn(me.id);
    const r = await post({ slug: w.board.slug, title: "Suits", links: "yalycouture.com\nhttps://reddit.com/r/hoian" }) as { proposalId: string };
    const { rows } = await t.db.query<{ kind: string; url: string; added_by: string }>(
      "select kind, url, added_by from proposal_detail where proposal_id = $1 order by url", [r.proposalId]);
    expect(rows).toEqual([
      { kind: "link", url: "https://reddit.com/r/hoian", added_by: me.id },
      { kind: "link", url: "https://yalycouture.com/", added_by: me.id },
    ]);
  });

  it("a version points at the original and leaves it unchanged", async () => {
    const w = await world(t.db);
    const me = await w.person("Marcus");
    const orig = await w.proposal(me.id, { title: "Overnight boat", cost_text: "~$180", min_count: 10 });
    signedIn(me.id);
    const r = await post({ slug: w.board.slug, title: "Overnight boat", cost: "~$120", min: "10", versionOf: orig }) as { proposalId: string };
    const { rows } = await t.db.query<{ id: string; version_of: string | null; cost_text: string }>(
      "select id, version_of, cost_text from proposal order by created_at");
    expect(rows.find((x) => x.id === r.proposalId)).toMatchObject({ version_of: orig, cost_text: "~$120" });
    expect(rows.find((x) => x.id === orig)).toMatchObject({ version_of: null, cost_text: "~$180" });
  });

  it("a stranger is asked for name and number, and the proposal exists only after", async () => {
    const w = await world(t.db);
    expect(await post({ slug: w.board.slug, title: "Night market" })).toMatchObject({ error: "need_identity" });
    expect((await t.db.query("select 1 from proposal")).rows).toHaveLength(0);
    const r = await post({ slug: w.board.slug, title: "Night market", name: "Hana", phone: "607-555-0144" });
    expect(r.status).toBe("ok");
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
    await respond({ proposalId: pid, answer: "maybe" });
    await respond({ proposalId: pid, answer: "in" });
    expect((await responseOf(t.db, pid, priya.id))?.answer).toBe("in");
    const ev = (await events(t.db, "response", pid)).map((e) => e.data);
    expect(ev).toEqual([{ prev: null, next: "maybe" }, { prev: "maybe", next: "in" }]);
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
    expect(await lock({ proposalId: pid })).toMatchObject({ error: "not_in" });
    await respond({ proposalId: pid, answer: "maybe" });
    expect(await lock({ proposalId: pid })).toMatchObject({ error: "not_in" });
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
    expect(await editProposal({ proposalId: pid, detail: "Two fittings", time: "3:00pm" })).toEqual({ status: "ok" });
    expect(await editProposal({ proposalId: pid, title: "New" })).toMatchObject({ error: "fixed" });
    expect(await editProposal({ proposalId: pid, min: 3 })).toMatchObject({ error: "fixed" });
    expect(await editProposal({ proposalId: pid, cost: "$1" })).toMatchObject({ error: "fixed" });
    signedIn((await w.person()).id);
    expect(await editProposal({ proposalId: pid, detail: "x" })).toMatchObject({ error: "not_poster" });
    const { rows } = await t.db.query("select detail, time_text, title from proposal where id = $1", [pid]);
    expect(rows[0]).toEqual({ detail: "Two fittings", time_text: "3:00pm", title: "Suits in Hoi An" });
  });
});

describe("lock", () => {
  async function ready() {
    const w = await world(t.db);
    const people = [await w.person("A"), await w.person("B"), await w.person("C"), await w.person("D")];
    const hana = await w.person("Hana");
    const pid = await w.proposal(people[0].id, { min_count: 3 });
    await w.answer(pid, people[0].id, "in", [D.mon, D.tue]);
    await w.answer(pid, people[1].id, "in", [D.tue]);
    await w.answer(pid, people[2].id, "in", [D.tue, D.wed]);
    await w.answer(pid, people[3].id, "in", [D.wed]);
    await w.answer(pid, hana.id, "maybe");
    return { w, people, hana, pid };
  }

  it("two parallel locks: one locked, one already_on, one onReached", async () => {
    const { people, hana, pid } = await ready();
    signedIn(people[0].id);
    const a = lock({ proposalId: pid });
    signedIn(people[1].id);
    const b = lock({ proposalId: pid });
    const got = (await Promise.all([a, b])).map((r) => r.status).sort();
    expect(got).toEqual(["already_on", "locked"]);
    const reached = calls.filter((c) => c.kind === "onReached");
    expect(reached).toHaveLength(1);
    expect(reached[0].msg).toMatchObject({ onDay: D.tue, maybes: [hana.id], cantMakeIt: [people[3].id] });
    expect((reached[0].msg.yeses as string[]).sort()).toEqual(people.map((p) => p.id).sort());
    expect(await events(t.db, "threshold_reached", pid)).toHaveLength(1);
    expect(await events(t.db, "text_sent")).toHaveLength(1);
  });

  it("a maybe is refused and nothing changes", async () => {
    const { hana, pid } = await ready();
    signedIn(hana.id);
    expect(await lock({ proposalId: pid })).toMatchObject({ error: "not_in" });
    const { rows } = await t.db.query<{ status: string }>("select status from proposal where id = $1", [pid]);
    expect(rows[0].status).toBe("open");
  });

  it("not ready is refused", async () => {
    const w = await world(t.db);
    const a = await w.person();
    const pid = await w.proposal(a.id);
    await w.answer(pid, a.id, "in", [D.mon]);
    signedIn(a.id);
    expect(await lock({ proposalId: pid })).toMatchObject({ error: "not_ready" });
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

  it("reopens an idled proposal at a lower number, keeps answers, sends nothing", async () => {
    const w = await world(t.db);
    const me = await w.person();
    const pid = await w.proposal(me.id, { min_count: 6, deadline: "2020-01-01" });
    await w.answer(pid, me.id, "in", [D.mon]);
    signedIn(me.id);
    expect(await reopenProposal({ proposalId: pid, min: 6 })).toMatchObject({ error: "not_lower" });
    expect(await reopenProposal({ proposalId: pid, min: 4 })).toEqual({ status: "ok" });
    const { rows } = await t.db.query("select min_count, deadline, status from proposal where id = $1", [pid]);
    expect(rows[0]).toEqual({ min_count: 4, deadline: D.sat, status: "open" });
    expect(await responseOf(t.db, pid, me.id)).toMatchObject({ answer: "in" });
    expect(await events(t.db, "proposal_reopened", pid)).toHaveLength(1);
    expect(calls).toHaveLength(0);
  });

  it("refuses to reopen a proposal that is not idled", async () => {
    const w = await world(t.db);
    const me = await w.person();
    const pid = await w.proposal(me.id, { min_count: 6 });
    signedIn(me.id);
    expect(await reopenProposal({ proposalId: pid, min: 4 })).toMatchObject({ error: "not_idled" });
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
    expect((await events(t.db, "response", pid))[0]).toMatchObject({ source: "group_link", share_id: null });
  });

  it(`allows ${LIMITS.share.perIp} shares a minute from one address, then refuses`, async () => {
    const w = await world(t.db);
    const pid = await w.proposal((await w.person()).id);
    for (let i = 0; i < LIMITS.share.perIp; i++) expect((await share({ proposalId: pid })).status).toBe("ok");
    expect(await share({ proposalId: pid })).toMatchObject({ error: "rate_limited" });
  });
});
