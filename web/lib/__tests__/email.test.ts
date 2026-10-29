// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Resend } from "resend";
import {
  createResendSender,
  loopFooterHtml,
  loopFooterText,
  MIN_SEND_GAP_MS,
  resetSentEmails,
  sendEmail,
  sentEmails,
} from "@/lib/email";

type SendResult = { data: unknown; error: unknown; headers: Record<string, string> | null };
const resendSend = vi.fn<(payload: unknown) => Promise<SendResult>>();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (payload: unknown) => resendSend(payload) };
  },
}));

const env = { ...process.env };

beforeEach(() => {
  process.env.EMAIL_FROM = "Loop <loop@example.edu>";
  resetSentEmails();
});

afterEach(() => {
  process.env = { ...env };
});

describe("sendEmail under test", () => {
  it("records the send in memory instead of calling Resend", async () => {
    await sendEmail({ to: "a@cornell.edu", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    expect(sentEmails).toEqual([
      { from: "Loop <loop@example.edu>", to: "a@cornell.edu", subject: "Hi", html: "<p>hi</p>", text: "hi" },
    ]);
    resetSentEmails();
    expect(sentEmails).toEqual([]);
  });

  it("still requires EMAIL_FROM", async () => {
    delete process.env.EMAIL_FROM;
    await expect(
      sendEmail({ to: "a@cornell.edu", subject: "Hi", html: "", text: "" }),
    ).rejects.toThrow("Missing environment variable EMAIL_FROM");
  });
});

describe("loop footer", () => {
  const input = {
    loopTitle: "CS 2110 <study>",
    organizerFirstName: "Dana",
    loopUrl: "https://loop.example/l/cs-2110",
    leaveUrl: "https://loop.example/l/cs-2110/leave",
  };

  it("names the loop and organizer and links the loop and leave pages", () => {
    const html = loopFooterHtml(input);
    expect(html).toContain("CS 2110 &lt;study&gt;");
    expect(html).toContain("Dana");
    expect(html).toContain('href="https://loop.example/l/cs-2110"');
    expect(html).toContain('href="https://loop.example/l/cs-2110/leave"');

    const text = loopFooterText(input);
    expect(text).toContain("CS 2110 <study>");
    expect(text).toContain("Dana");
    expect(text).toContain("https://loop.example/l/cs-2110\n");
    expect(text).toContain("https://loop.example/l/cs-2110/leave");
  });
});

describe("createResendSender (real Resend path, mocked client)", () => {
  const payload = { from: "Loop <loop@example.edu>", to: "a@cornell.edu", subject: "Hi", html: "", text: "" };
  const ok: SendResult = { data: { id: "e1" }, error: null, headers: {} };
  const rateLimited = (headers: Record<string, string> | null): SendResult => ({
    data: null,
    error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" },
    headers,
  });

  let clock = 0;
  let sendTimes: number[] = [];
  let sleeps: number[] = [];

  function sender() {
    const client = new Resend("re_test");
    return createResendSender({
      client: () => client,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
  }

  beforeEach(() => {
    clock = 1_000_000;
    sendTimes = [];
    sleeps = [];
    resendSend.mockReset();
    resendSend.mockImplementation(async () => {
      sendTimes.push(clock);
      return ok;
    });
  });

  it("spaces consecutive sends at least MIN_SEND_GAP_MS apart on the fake clock", async () => {
    const send = sender();
    await send(payload);
    await send(payload);
    clock += 100; // a little real work between sends still waits out the rest of the gap
    await send(payload);
    expect(sendTimes).toHaveLength(3);
    for (let i = 1; i < sendTimes.length; i++) {
      expect(sendTimes[i] - sendTimes[i - 1]).toBeGreaterThanOrEqual(MIN_SEND_GAP_MS);
    }
  });

  it("does not wait before the first send", async () => {
    await sender()(payload);
    expect(sleeps).toEqual([]);
  });

  it("retries a 429 once after retry-after, then succeeds", async () => {
    resendSend.mockImplementationOnce(async () => {
      sendTimes.push(clock);
      return rateLimited({ "retry-after": "2" });
    });
    await expect(sender()(payload)).resolves.toBeUndefined();
    expect(resendSend).toHaveBeenCalledTimes(2);
    expect(sleeps[0]).toBe(2000);
    expect(sendTimes[1] - sendTimes[0]).toBeGreaterThanOrEqual(2000);
  });

  it("waits 1 s when a 429 has no retry-after", async () => {
    resendSend.mockImplementationOnce(async () => rateLimited(null));
    await sender()(payload);
    expect(sleeps[0]).toBe(1000);
    expect(resendSend).toHaveBeenCalledTimes(2);
  });

  it("throws after two 429s", async () => {
    resendSend.mockImplementation(async () => rateLimited({}));
    await expect(sender()(payload)).rejects.toThrow("Resend: rate_limit_exceeded");
    expect(resendSend).toHaveBeenCalledTimes(2);
  });

  it("throws on other errors without retrying", async () => {
    resendSend.mockImplementation(async () => ({
      data: null,
      error: { name: "validation_error", statusCode: 422, message: "bad to" },
      headers: {},
    }));
    await expect(sender()(payload)).rejects.toThrow("Resend: validation_error: bad to");
    expect(resendSend).toHaveBeenCalledTimes(1);
  });

  it("rejects with the client factory's error and never calls Resend", async () => {
    const send = createResendSender({
      client: () => {
        throw new Error("Missing environment variable RESEND_API_KEY");
      },
      now: () => clock,
      sleep: async () => {},
    });
    await expect(send(payload)).rejects.toThrow("Missing environment variable RESEND_API_KEY");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("leaves the stub path instant and off Resend", async () => {
    process.env.EMAIL_FROM = "Loop <loop@example.edu>";
    await sendEmail({ to: "b@cornell.edu", subject: "x", html: "", text: "" });
    expect(resendSend).not.toHaveBeenCalled();
    expect(sentEmails).toHaveLength(1);
  });

  describe("concurrent sends on fake timers (default now and sleep)", () => {
    const T = 1_700_000_000_000;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(T);
      resendSend.mockImplementation(async () => {
        sendTimes.push(Date.now());
        return ok;
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("Promise.all of three sends spaces them MIN_SEND_GAP_MS apart", async () => {
      const send = createResendSender({ client: () => new Resend("re_test") });
      const all = Promise.all([send(payload), send(payload), send(payload)]);
      await vi.runAllTimersAsync();
      await all;
      expect(sendTimes).toEqual([T, T + 550, T + 1100]);
    });

    it("a 429 pauses the queue: a concurrent send already holding a slot waits out retry-after too", async () => {
      resendSend.mockImplementationOnce(async () => {
        sendTimes.push(Date.now());
        return rateLimited({ "retry-after": "2" });
      });
      const send = createResendSender({ client: () => new Resend("re_test") });
      const all = Promise.all([send(payload), send(payload)]);
      await vi.runAllTimersAsync();
      await all;

      // sendTimes: the first attempt (429), then its retry and the second send.
      expect(sendTimes).toHaveLength(3);
      expect(sendTimes[0]).toBe(T);
      for (const t of sendTimes.slice(1)) expect(t).toBeGreaterThanOrEqual(T + 2000);
      expect(sendTimes[2] - sendTimes[1]).toBeGreaterThanOrEqual(MIN_SEND_GAP_MS);
    });
  });
});
