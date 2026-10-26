import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { notifier, setNotifier, VerifyNotifier } from "..";
import { checkVerification, verifyConfig } from "../verify";
import { makePerson, openTestDb, type TestDb } from "@/test/db";
import { world } from "@/test/world";

const CFG = { accountSid: "AC123", authToken: "secret", serviceSid: "VA789" };

let t: TestDb;
beforeAll(async () => void (t = await openTestDb()));
afterAll(() => t.close());
beforeEach(() => t.reset());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setNotifier(null);
});

type Req = { url: string; auth: string; form: Record<string, string> };

/** Stubs fetch with one reply for every request. */
function verify(reply: { status: number; json: Record<string, unknown> } | "reject" = { status: 201, json: { sid: "VE1", status: "pending" } }) {
  const reqs: Req[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    reqs.push({ url, auth: (init.headers as Record<string, string>).Authorization, form: Object.fromEntries(new URLSearchParams(init.body as URLSearchParams)) });
    if (reply === "reject") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(reply.json), { status: reply.status });
  }));
  return reqs;
}

describe("choosing Verify", () => {
  it("needs all three variables, and wins over the Messaging Service", () => {
    expect(verifyConfig({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" })).toBeNull();
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC1");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "t");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG1");
    vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VA1");
    expect(notifier(t.db)).toBeInstanceOf(VerifyNotifier);
  });
});

describe("codes through Verify", () => {
  it("starts an SMS verification with Basic auth and records it without the code", async () => {
    const reqs = verify();
    const p = await makePerson(t.db, "Priya");
    expect(await new VerifyNotifier(t.db, CFG, () => {}).code({ boardId: null, personId: p.id, phone: p.phone, code: "123456" })).toEqual({ sent: true });
    expect(reqs).toEqual([{
      url: "https://verify.twilio.com/v2/Services/VA789/Verifications",
      auth: `Basic ${Buffer.from("AC123:secret").toString("base64")}`,
      form: { To: p.phone, Channel: "sms" },
    }]);
    const { rows } = await t.db.query<{ person_id: string; data: Record<string, unknown> }>("select person_id, data from event where type = 'text_sent'");
    expect(rows).toEqual([{ person_id: p.id, data: { channel: "sms", kind: "code", status: "sent", sid: "VE1" } }]);
  });

  it("texts a number that is not a person yet", async () => {
    verify();
    expect(await new VerifyNotifier(t.db, CFG, () => {}).code({ boardId: null, personId: null, phone: "+16075550123", code: "1" })).toEqual({ sent: true });
    const { rows } = await t.db.query<{ person_id: string | null }>("select person_id from event where type = 'text_sent'");
    expect(rows).toEqual([{ person_id: null }]);
  });

  it("a refused or unreachable start is not sent", async () => {
    verify({ status: 429, json: { code: 60203 } });
    const n = new VerifyNotifier(t.db, CFG, () => {});
    expect(await n.code({ boardId: null, personId: null, phone: "+16075550123", code: "1" })).toEqual({ sent: false });
    verify("reject");
    expect(await n.code({ boardId: null, personId: null, phone: "+16075550123", code: "1" })).toEqual({ sent: false });
  });

  it("plan texts are only logged", async () => {
    const reqs = verify();
    const w = await world(t.db);
    const priya = await w.person("Priya");
    const lines: string[] = [];
    await new VerifyNotifier(t.db, CFG, (l) => lines.push(l)).onReached({
      boardId: w.board.id, proposalId: await w.proposal(priya.id), title: "Suits", url: "/p/x",
      onDay: null, timeText: null, lockedBy: priya.id, yeses: [priya.id], cantMakeIt: [], maybes: [],
    });
    expect(reqs).toHaveLength(0);
    expect(JSON.parse(lines[0])).toMatchObject({ notify: "onReached", to: priya.phone });
  });
});

describe("checking a code", () => {
  it("approved, wrong, gone, and failures", async () => {
    const reqs = verify({ status: 200, json: { status: "approved" } });
    expect(await checkVerification(CFG, "+16075550123", "123456")).toBe("approved");
    expect(reqs[0]).toMatchObject({ url: "https://verify.twilio.com/v2/Services/VA789/VerificationCheck", form: { To: "+16075550123", Code: "123456" } });
    verify({ status: 200, json: { status: "pending" } });
    expect(await checkVerification(CFG, "+16075550123", "000000")).toBe("wrong");
    verify({ status: 404, json: { code: 20404 } });
    expect(await checkVerification(CFG, "+16075550123", "123456")).toBe("expired");
    verify({ status: 500, json: {} });
    expect(await checkVerification(CFG, "+16075550123", "123456")).toBe("failed");
    verify("reject");
    expect(await checkVerification(CFG, "+16075550123", "123456")).toBe("failed");
  });
});
