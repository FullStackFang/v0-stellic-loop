import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LogNotifier, notifier, setNotifier, TwilioNotifier, type Notifier } from "..";
import { twilioConfig } from "../twilio";
import { makePerson, openTestDb, type TestDb } from "@/test/db";
import { D, world } from "@/test/world";

const CFG = { accountSid: "AC123", authToken: "secret", messagingServiceSid: "MG456" };

let t: TestDb;
beforeAll(async () => void (t = await openTestDb()));
afterAll(() => t.close());
beforeEach(() => t.reset());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setNotifier(null);
});

type Req = { url: string; auth: string; form: URLSearchParams };

/** Stubs fetch; `reply` decides each response by recipient. */
function twilio(reply: (to: string) => { status: number; json: Record<string, unknown> } | "reject" = () => ({ status: 201, json: { sid: "SM1" } })) {
  const reqs: Req[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const form = new URLSearchParams(init.body as URLSearchParams);
    reqs.push({ url, auth: (init.headers as Record<string, string>).Authorization, form });
    const r = reply(form.get("To")!);
    if (r === "reject") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.json), { status: r.status });
  }));
  return reqs;
}

async function textEvents() {
  const { rows } = await t.db.query<{ person_id: string; data: Record<string, unknown> }>(
    "select person_id, data from event where type = 'text_sent' order by at, id");
  return rows;
}

describe("the Twilio send", () => {
  it("posts to the Messages API with Basic auth and the Messaging Service", async () => {
    const reqs = twilio();
    const p = await makePerson(t.db, "Priya");
    expect(await new TwilioNotifier(t.db, CFG).code({ boardId: null, personId: p.id, phone: p.phone, code: "123456" })).toEqual({ sent: true });
    expect(reqs).toHaveLength(1);
    expect(reqs[0].url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(reqs[0].auth).toBe(`Basic ${Buffer.from("AC123:secret").toString("base64")}`);
    expect(Object.fromEntries(reqs[0].form)).toEqual({ To: p.phone, MessagingServiceSid: "MG456", Body: "Quorum code: 123456. It expires in 10 minutes." });
    const [ev] = await textEvents();
    expect(ev).toMatchObject({ person_id: p.id, data: { channel: "sms", kind: "code", status: "sent", sid: "SM1" } });
    expect(JSON.stringify(await textEvents())).not.toContain("123456");
  });

  it("records a refusal with Twilio's code, and a network failure", async () => {
    const a = await makePerson(t.db, "A");
    const b = await makePerson(t.db, "B");
    twilio((to) => (to === a.phone ? { status: 400, json: { code: 30003 } } : "reject"));
    const n = new TwilioNotifier(t.db, CFG);
    expect(await n.code({ boardId: null, personId: a.id, phone: a.phone, code: "1" })).toEqual({ sent: false });
    expect(await n.code({ boardId: null, personId: b.id, phone: b.phone, code: "1" })).toEqual({ sent: false });
    expect((await textEvents()).map((e) => e.data)).toEqual([
      { channel: "sms", kind: "code", status: "failed", error: "30003" },
      { channel: "sms", kind: "code", status: "failed", error: "network" },
    ]);
  });

  it("21610 marks the person opted out; later texts skip them; a code still goes and clears it", async () => {
    const w = await world(t.db);
    const priya = await w.person("Priya");
    const pid = await w.proposal(priya.id, { needs_day: false });
    let stop = true;
    const reqs = twilio(() => (stop ? { status: 400, json: { code: 21610 } } : { status: 201, json: { sid: "SM2" } }));
    const n = new TwilioNotifier(t.db, CFG);
    const base = { boardId: w.board.id, proposalId: pid, title: "Suits", url: "x", onDay: null, timeText: null, lockedBy: priya.id, cantMakeIt: [], maybes: [] };

    await n.onReached({ ...base, yeses: [priya.id] });
    const optOut = async () => (await t.db.query<{ sms_opt_out: boolean }>("select sms_opt_out from person where id = $1", [priya.id])).rows[0].sms_opt_out;
    expect(await optOut()).toBe(true);

    await n.onReached({ ...base, yeses: [priya.id] });
    expect(reqs).toHaveLength(1);
    expect((await textEvents())[1].data).toEqual({ channel: "sms", kind: "onReached", status: "skipped", reason: "opted_out" });

    stop = false;
    expect(await n.code({ boardId: null, personId: priya.id, phone: priya.phone, code: "1" })).toEqual({ sent: true });
    expect(await optOut()).toBe(false);
  });

  it("never texts a number outside the US", async () => {
    const reqs = twilio();
    const ana = await makePerson(t.db, "Ana", { phone: "+447700900123" });
    expect(await new TwilioNotifier(t.db, CFG).code({ boardId: null, personId: ana.id, phone: ana.phone, code: "1" })).toEqual({ sent: false });
    expect(reqs).toHaveLength(0);
    expect((await textEvents())[0].data).toEqual({ channel: "sms", kind: "code", status: "skipped", reason: "not_us" });
  });
});

describe("which notifier", () => {
  const set = () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC1");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG1");
  };

  it("Twilio only with all three variables", () => {
    set();
    expect(notifier(t.db)).toBeInstanceOf(TwilioNotifier);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    expect(notifier(t.db)).toBeInstanceOf(LogNotifier);
    expect(twilioConfig({})).toBeNull();
  });

  it("setNotifier still wins", () => {
    set();
    const spy = {} as Notifier;
    setNotifier(() => spy);
    expect(notifier(t.db)).toBe(spy);
  });

  it("the log notifier reports a code as sent", async () => {
    const p = await makePerson(t.db);
    expect(await new LogNotifier(t.db, () => {}).code({ boardId: null, personId: p.id, phone: p.phone, code: "1" })).toEqual({ sent: true });
  });
});

describe("what each person gets", () => {
  it("on ON: 6 day-works, 2 a-day-you-didn't-pick, 1 maybe, each with their own sign-in link", async () => {
    const w = await world(t.db);
    const ins = await Promise.all(Array.from({ length: 8 }, (_, i) => w.person(`In${i}`)));
    const maybe = await w.person("Maybe");
    const pid = await w.proposal(ins[0].id, { min_count: 8 });
    const reqs = twilio();
    await new TwilioNotifier(t.db, CFG).onReached({
      boardId: w.board.id, proposalId: pid, title: "Suits", url: "x", onDay: D.tue, timeText: "7pm", lockedBy: ins[0].id,
      yeses: ins.map((p) => p.id), cantMakeIt: [ins[6].id, ins[7].id], maybes: [maybe.id],
    });
    const body = (phone: string) => reqs.find((r) => r.form.get("To") === phone)!.form.get("Body")!;
    const link = String.raw`https://board\.test/m/[A-Za-z0-9_-]{22}`;
    expect(reqs).toHaveLength(9);
    for (const p of ins.slice(0, 6)) expect(body(p.phone)).toMatch(new RegExp(`^Suits is on: Mon 16, 7pm\\. 8 in\\. ${link} Got an idea\\? Post it on the board\\.$`));
    for (const p of ins.slice(6)) expect(body(p.phone)).toMatch(new RegExp(`^Suits is on for Mon 16, a day you didn't pick\\. 8 in\\. Still in\\? ${link}$`));
    expect(body(maybe.phone)).toMatch(new RegExp(`^Suits is on\\. 8 in\\. You said maybe\\. In\\? ${link}$`));

    const { rows: tokens } = await t.db.query<{ person_id: string; to_path: string; source: string }>("select person_id, to_path, source from magic_token");
    expect(tokens).toHaveLength(9);
    expect(tokens.every((k) => k.to_path === `/p/${pid}`)).toBe(true);
    expect(tokens.find((k) => k.person_id === maybe.id)!.source).toBe("maybe_nudge");
    expect(tokens.filter((k) => k.source === "on_text")).toHaveLength(8);
  });

  it("a no-day intent says it is on, without a day", async () => {
    const w = await world(t.db);
    const a = await w.person("A");
    const pid = await w.proposal(a.id, { needs_day: false });
    const reqs = twilio();
    await new TwilioNotifier(t.db, CFG).onReached({
      boardId: w.board.id, proposalId: pid, title: "Suits", url: "x", onDay: null, timeText: null, lockedBy: a.id,
      yeses: [a.id], cantMakeIt: [], maybes: [],
    });
    expect(reqs[0].form.get("Body")).toMatch(/^Suits is on\. 1 in\. https:\/\/board\.test\/m\/\S+ Got an idea\? Post it on the board\.$/);
  });

  it("a drop texts the poster with the name, or Someone when it is off", async () => {
    const w = await world(t.db);
    const josh = await w.person("Josh");
    const marcus = await w.person("Marcus");
    const quiet = await w.person("Quiet", { show_name: false });
    const pid = await w.proposal(josh.id);
    const reqs = twilio();
    const n = new TwilioNotifier(t.db, CFG);
    const base = { boardId: w.board.id, proposalId: pid, title: "Suits", url: "x", to: josh.id, count: 7 };
    await n.dropped({ ...base, who: marcus.id });
    await n.dropped({ ...base, who: quiet.id });
    expect(reqs.map((r) => r.form.get("To"))).toEqual([josh.phone, josh.phone]);
    expect(reqs[0].form.get("Body")).toMatch(/^Marcus dropped out of Suits\. 7 in\. https:\/\/board\.test\/m\/\S+$/);
    expect(reqs[1].form.get("Body")).toMatch(/^Someone dropped out of Suits\. 7 in\. https:\/\/board\.test\/m\/\S+$/);
  });

  it("the one-more text carries the recipient's share link and no sign-in token", async () => {
    const w = await world(t.db);
    const a = await w.person("A");
    const pid = await w.proposal(a.id);
    const reqs = twilio();
    await new TwilioNotifier(t.db, CFG).oneMore({
      boardId: w.board.id, proposalId: pid, title: "Suits", url: "x", count: 7, min: 8,
      to: [{ personId: a.id, url: `https://board.test/p/${pid}?s=AbCdEf1234` }],
    });
    const body = reqs[0].form.get("Body")!;
    expect(body).toBe(`7 of 8 for Suits. One more and it's on. Send it to someone: https://board.test/p/${pid}?s=AbCdEf1234`);
    expect(body).not.toContain("/m/");
    expect((await t.db.query("select 1 from magic_token")).rows).toHaveLength(0);
  });
});
