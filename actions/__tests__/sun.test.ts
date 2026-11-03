import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/db";
import { D, world } from "@/test/world";
import { newDevice, signedIn } from "@/test/jar";
import { enterCode, spyNotifier } from "@/test/notify";
import { resetLimits } from "@/lib/ratelimit";
import { post } from "../post";
import { respond } from "../respond";
import { editProposal } from "../details";
import { setShareWithSteward } from "../settings";
import { respondAs } from "@/lib/ops";

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(() => t.close());
beforeEach(async () => { await t.reset(); newDevice(); resetLimits(); spyNotifier(); });

it("stores a slot, defaults sharing off, and forms on the fourth in with its day", async () => {
  const w = await world(t.db), poster = await w.person("Marcus");
  signedIn(poster.id);
  const result = await post({ slug: w.board.slug, title: "Boat", day: D.fri, time: "6pm", place: "Pier" });
  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;
  const id = result.proposalId;
  expect((await t.db.query("select * from proposal where id = $1", [id])).rows[0]).toMatchObject({ day: D.fri, place: "Pier", needs_day: false, deadline: D.fri });
  expect((await t.db.query("select share_with_steward from board_person where person_id = $1", [poster.id])).rows[0]).toEqual({ share_with_steward: false });
  for (const name of ["Elena", "Tom", "Priya"]) {
    const p = await w.person(name); signedIn(p.id);
    expect((await respond({ proposalId: id, answer: "in" })).status).toBe("ok");
  }
  expect((await t.db.query("select status, on_day from proposal where id = $1", [id])).rows[0]).toEqual({ status: "on", on_day: D.fri });
  expect((await t.db.query("select id from event where type = 'threshold_reached' and proposal_id = $1", [id])).rows).toHaveLength(1);
});

it("rejects maybe before creating an identity challenge", async () => {
  const w = await world(t.db), p = await w.proposal(null);
  expect(await respond({ proposalId: p, answer: "maybe" })).toMatchObject({ error: "bad_answer" });
});

it("rejects dates outside the space window", async () => {
  const w = await world(t.db), p = await w.person(); signedIn(p.id);
  expect(await post({ slug: w.board.slug, title: "Boat", day: "2099-03-01" })).toMatchObject({ status: "error" });
});

it("edits an open slot with an event and refuses formed edits", async () => {
  const w = await world(t.db), p = await w.person(); signedIn(p.id);
  const id = await w.proposal(p.id, { needs_day: false });
  expect(await editProposal({ proposalId: id, day: D.mon, time: "7pm", place: "Library" })).toMatchObject({ status: "ok" });
  expect((await t.db.query("select day, place from proposal where id = $1", [id])).rows[0]).toEqual({ day: D.mon, place: "Library" });
  expect((await t.db.query("select id from event where proposal_id = $1 and type = 'detail_added'", [id])).rows).toHaveLength(1);
  await t.db.query("update proposal set status = 'on', on_at = now() where id = $1", [id]);
  expect(await editProposal({ proposalId: id, time: "8pm" })).toMatchObject({ status: "error" });
});

it("changes only the viewer's membership preference", async () => {
  const w = await world(t.db), a = await w.person(), b = await w.person(); signedIn(a.id);
  expect(await setShareWithSteward(w.board.id, true)).toEqual({ status: "ok" });
  expect((await t.db.query("select share_with_steward from board_person where person_id = $1", [a.id])).rows[0]).toEqual({ share_with_steward: true });
  expect((await t.db.query("select share_with_steward from board_person where person_id = $1", [b.id])).rows[0]).toEqual({ share_with_steward: false });
  expect(await setShareWithSteward(w.board.id, false)).toEqual({ status: "ok" });
});

it("concurrent fourth taps latch once and retain both responses", async () => {
  const w = await world(t.db), poster = await w.person();
  const id = await w.proposal(poster.id, { needs_day: false, day: D.fri, deadline: D.fri });
  for (let i = 0; i < 3; i++) await w.answer(id, (await w.person()).id, "in");
  const a = await w.person(), b = await w.person();
  const results = await Promise.all([a, b].map(p => t.db.tx(q => respondAs(q, p.id, id, "in", { source: "direct", shareId: null }))));
  expect(results.filter(r => r.status === "ok" && r.formed)).toHaveLength(1);
  expect((await t.db.query("select count(*)::int n from response where proposal_id = $1 and answer = 'in'", [id])).rows[0]).toEqual({ n: 5 });
  expect((await t.db.query("select id from event where proposal_id = $1 and type = 'threshold_reached'", [id])).rows).toHaveLength(1);
});

it("an explicit slot replaces legacy day voting", async () => {
  const w = await world(t.db), poster = await w.person(); signedIn(poster.id);
  const id = await w.proposal(poster.id, { needs_day: true });
  expect(await editProposal({ proposalId: id, day: D.fri })).toEqual({ status: "ok" });
  expect((await t.db.query("select needs_day, day from proposal where id = $1", [id])).rows[0]).toEqual({ needs_day: false, day: D.fri });
});

it("refuses an invalid day before sending a code", async () => {
  const w = await world(t.db), calls = spyNotifier();
  expect(await post({ slug: w.board.slug, title: "Boat", day: "2099-03-01", name: "New", phone: "+16075550123" })).toMatchObject({ error: "bad_day" });
  expect(calls).toHaveLength(0);
});

it("returns a recoverable post error after verification when the window changes", async () => {
  const w = await world(t.db), calls = spyNotifier();
  expect(await post({ slug: w.board.slug, title: "Boat", day: D.fri, name: "New", phone: "+16075550123" })).toMatchObject({ status: "needs_code" });
  await t.db.query("update board set window_end = $2 where id = $1", [w.board.id, D.mon]);
  expect(await enterCode(calls, "+16075550123")).toMatchObject({ status: "error", error: "bad_day", verified: true });
  expect(await post({ slug: w.board.slug, title: "Boat" })).toMatchObject({ status: "ok" });
});
