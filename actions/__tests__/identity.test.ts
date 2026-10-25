import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setNotifier, TwilioNotifier } from "@/lib/notify";
import { respond } from "../respond";
import { verifyCode } from "../verifyCode";
import { resetLimits } from "@/lib/ratelimit";
import { SESSION_COOKIE } from "@/lib/session";
import { jar, newDevice, signedIn } from "@/test/jar";
import { spyNotifier, type Call } from "@/test/notify";
import { makeBoard, makePerson, openTestDb, type TestDb } from "@/test/db";

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

async function proposal(boardId: string, posterId: string, title = "Suits in Hoi An") {
  const { rows } = await t.db.query<{ id: string }>(
    "insert into proposal (board_id, poster_id, title) values ($1, $2, $3) returning id", [boardId, posterId, title]);
  return rows[0].id;
}
const answerOf = async (proposalId: string, personId: string) =>
  (await t.db.query<{ answer: string }>("select answer from response where proposal_id = $1 and person_id = $2", [proposalId, personId])).rows[0]?.answer ?? null;

describe("unknown number answers with no round trip", () => {
  it("creates the person, records the answer, sets the cookie, writes person_added", async () => {
    const b = await makeBoard(t.db);
    const poster = await makePerson(t.db, "Poster");
    const pid = await proposal(b.id, poster.id);

    const r = await respond({ proposalId: pid, answer: "in", name: "Priya", phone: "(607) 555-0123" });
    expect(r.status).toBe("ok");

    const { rows: [p] } = await t.db.query<{ id: string }>("select id from person where phone = '+16075550123'");
    expect(await answerOf(pid, p.id)).toBe("in");
    expect(jar.cookies.get(SESSION_COOKIE)).toBeTruthy();
    const { rows: ev } = await t.db.query<{ proposal_id: string }>(
      "select proposal_id from event where type = 'person_added' and person_id = $1", [p.id]);
    expect(ev).toEqual([{ proposal_id: pid }]);
    const { rows: roster } = await t.db.query("select 1 from board_person where board_id = $1 and person_id = $2", [b.id, p.id]);
    expect(roster).toHaveLength(1);
  });

  it("asks for a number without a cookie and refuses a bad one", async () => {
    const b = await makeBoard(t.db);
    const pid = await proposal(b.id, (await makePerson(t.db)).id);
    expect(await respond({ proposalId: pid, answer: "in" })).toMatchObject({ status: "error", error: "need_identity" });
    expect(await respond({ proposalId: pid, answer: "in", name: "X", phone: "123" })).toMatchObject({ error: "bad_phone" });
    expect(await respond({ proposalId: pid, answer: "in", phone: "+1 607 555 0177" })).toMatchObject({ error: "need_name" });
  });
});

describe("the session", () => {
  it("a cookie is enough", async () => {
    const b = await makeBoard(t.db);
    const priya = await makePerson(t.db, "Priya");
    const pid = await proposal(b.id, priya.id);
    signedIn(priya.id);
    expect((await respond({ proposalId: pid, answer: "maybe" })).status).toBe("ok");
    expect(await answerOf(pid, priya.id)).toBe("maybe");
  });

  it("a tampered cookie is treated as absent", async () => {
    const b = await makeBoard(t.db);
    const priya = await makePerson(t.db, "Priya");
    const pid = await proposal(b.id, priya.id);
    signedIn(priya.id);
    jar.cookies.set(SESSION_COOKIE, jar.cookies.get(SESSION_COOKIE)!.replace(/.$/, (c) => (c === "A" ? "B" : "A")));
    expect(await respond({ proposalId: pid, answer: "in" })).toMatchObject({ error: "need_identity" });
  });

  it("same number on two boards is one person on both rosters", async () => {
    const b1 = await makeBoard(t.db);
    const b2 = await makeBoard(t.db);
    const poster = await makePerson(t.db);
    const p1 = await proposal(b1.id, poster.id);
    const p2 = await proposal(b2.id, poster.id);
    await respond({ proposalId: p1, answer: "in", name: "Priya", phone: "+16075550123" });
    expect((await respond({ proposalId: p2, answer: "in" })).status).toBe("ok");
    const { rows } = await t.db.query<{ n: number }>("select count(*)::int n from person where phone = '+16075550123'");
    expect(rows[0].n).toBe(1);
    const { rows: roster } = await t.db.query("select board_id from board_person bp join person p on p.id = bp.person_id where p.phone = '+16075550123'");
    expect(roster).toHaveLength(2);
  });
});

describe("known number on a cookieless device", () => {
  async function setup() {
    const b = await makeBoard(t.db);
    const priya = await makePerson(t.db, "Priya", { phone: "+16075550123" });
    const pid = await proposal(b.id, priya.id);
    newDevice();
    const r = await respond({ proposalId: pid, answer: "in", name: "Priya", phone: "+1 607 555 0123" });
    const code = calls.find((c) => c.kind === "code")?.msg.code as string;
    return { b, priya, pid, r, code };
  }

  it("records nothing, issues a code, asks for it", async () => {
    const { priya, pid, r, code } = await setup();
    expect(r).toEqual({ status: "needs_code", phone: "+16075550123" });
    expect(await answerOf(pid, priya.id)).toBeNull();
    expect(code).toMatch(/^\d{6}$/);
    const { rows } = await t.db.query<{ code_hash: string }>("select code_hash from otp_code where phone = '+16075550123'");
    expect(rows[0].code_hash).not.toContain(code);
    expect(jar.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("the correct code records the pending answer and later requests need no code", async () => {
    const { priya, pid, code } = await setup();
    expect(await verifyCode({ phone: "(607) 555-0123", code })).toEqual({ status: "ok", path: `/p/${pid}` });
    expect(await answerOf(pid, priya.id)).toBe("in");
    expect((await respond({ proposalId: pid, answer: "maybe" })).status).toBe("ok");
    expect(await answerOf(pid, priya.id)).toBe("maybe");
  });

  it("five wrong codes invalidate it; the sixth finds no code", async () => {
    const { code } = await setup();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) expect(await verifyCode({ phone: "+16075550123", code: wrong })).toMatchObject({ error: "wrong_code" });
    expect(await verifyCode({ phone: "+16075550123", code: wrong })).toMatchObject({ error: "too_many" });
    expect(await verifyCode({ phone: "+16075550123", code })).toMatchObject({ error: "expired" });
  });

  it("an expired code is refused", async () => {
    const { code } = await setup();
    await t.db.query("update otp_code set expires_at = now() - interval '1 minute'");
    expect(await verifyCode({ phone: "+16075550123", code })).toMatchObject({ error: "expired" });
  });
});

describe("US numbers, codes by text", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("a non-US number is refused and nothing is recorded", async () => {
    const b = await makeBoard(t.db);
    const pid = await proposal(b.id, (await makePerson(t.db)).id);
    expect(await respond({ proposalId: pid, answer: "in", name: "Ana", phone: "+44 7700 900123" }))
      .toMatchObject({ status: "error", error: "not_us", message: "US numbers only for now." });
    const { rows } = await t.db.query("select 1 from person where phone = '+447700900123'");
    expect(rows).toHaveLength(0);
  });

  it("a code Twilio refuses is discarded and the form says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: 30003 }), { status: 400 })));
    setNotifier((q) => new TwilioNotifier(q, { accountSid: "AC1", authToken: "tok", messagingServiceSid: "MG1" }));
    const b = await makeBoard(t.db);
    const priya = await makePerson(t.db, "Priya", { phone: "+16075550123" });
    const pid = await proposal(b.id, priya.id);
    newDevice();
    expect(await respond({ proposalId: pid, answer: "in", name: "Priya", phone: "607 555 0123" }))
      .toMatchObject({ status: "error", error: "code_not_sent", message: "We couldn't text that number. Try again." });
    expect((await t.db.query("select 1 from otp_code")).rows).toHaveLength(0);
    expect(await answerOf(pid, priya.id)).toBeNull();
    const { rows: [ev] } = await t.db.query<{ data: Record<string, unknown> }>("select data from event where type = 'text_sent'");
    expect(ev.data).toMatchObject({ channel: "sms", kind: "code", status: "failed", error: "30003" });
  });
});
