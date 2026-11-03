import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/db";
import { world } from "@/test/world";
import { newDevice, signedIn } from "@/test/jar";
import { enterCode, spyNotifier } from "@/test/notify";
import { resetLimits } from "@/lib/ratelimit";
import { post } from "../post";
import { editProposal } from "../details";
import { proposalById } from "@/lib/load";

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(() => t.close());
beforeEach(async () => { await t.reset(); newDevice(); resetLimits(); spyNotifier(); });
const intent = { rhythm: "weekly", preferences: ["ramen", "after 7"] };

it("stores metadata through OTP replay with one proposal and one initial yes", async () => {
  const w = await world(t.db), calls = spyNotifier();
  expect(await post({ slug: w.board.slug, title: "Dinner", intent, name: "New", phone: "+16075550123" })).toMatchObject({ status: "needs_code" });
  expect((await t.db.query("select id from proposal")).rows).toHaveLength(0);
  expect(await enterCode(calls, "+16075550123")).toMatchObject({ status: "ok" });
  const { rows } = await t.db.query<{ id: string; intent: unknown }>("select id,intent from proposal");
  expect(rows).toHaveLength(1); expect(rows[0].intent).toEqual(intent);
  expect((await t.db.query("select answer from response where proposal_id=$1", [rows[0].id])).rows).toEqual([{answer:"in"}]);
});
it("validates metadata before asking for identity", async () => {
  const w = await world(t.db), calls = spyNotifier();
  expect(await post({ slug: w.board.slug, title: "Dinner", intent: {rhythm:"daily",preferences:[]}, name:"New", phone:"+16075550123" })).toMatchObject({error:"bad_intent"});
  expect(calls).toHaveLength(0);
});
it("preserves pins on slot edits and guards updates by ownership and open state", async () => {
  const w = await world(t.db), owner = await w.person(), other = await w.person(); signedIn(owner.id);
  const r = await post({slug:w.board.slug,title:"Dinner",intent});
  expect(r.status).toBe("ok"); if(r.status!=="ok") return;
  expect(await editProposal({proposalId:r.proposalId,time:"7pm"})).toEqual({status:"ok"});
  expect((await proposalById(t.db,r.proposalId))?.intent).toEqual(intent);
  signedIn(other.id);
  expect(await editProposal({proposalId:r.proposalId,intent:{rhythm:"once",preferences:[]}})).toMatchObject({error:"not_poster"});
  signedIn(owner.id);
  expect(await editProposal({proposalId:r.proposalId,intent:{rhythm:"once",preferences:["quiet place"]}})).toEqual({status:"ok"});
  expect((await proposalById(t.db,r.proposalId))?.intent).toEqual({rhythm:"once",preferences:["quiet place"]});
  await t.db.query("update proposal set status='on',on_at=now() where id=$1",[r.proposalId]);
  expect(await editProposal({proposalId:r.proposalId,intent})).toMatchObject({error:"closed"});
});
it("copies preferences into a fresh version without changing the original", async () => {
  const w=await world(t.db), owner=await w.person(); signedIn(owner.id);
  const first=await post({slug:w.board.slug,title:"Dinner",intent}); if(first.status!=="ok") throw Error("post failed");
  const second=await post({slug:w.board.slug,title:"Dinner",intent,versionOf:first.proposalId}); if(second.status!=="ok") throw Error("repost failed");
  expect(second.proposalId).not.toBe(first.proposalId);
  expect(await proposalById(t.db,second.proposalId)).toMatchObject({version_of:first.proposalId,intent});
  expect((await t.db.query("select count(*)::int n from response where proposal_id=$1",[second.proposalId])).rows[0]).toEqual({n:1});
});
