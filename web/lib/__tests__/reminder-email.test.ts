// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loopFooterHtml, loopFooterText } from "@/lib/email";
import { reminderEmail, type ReminderEmailInput } from "@/lib/emails/reminder";

const base: ReminderEmailInput = {
  loopTitle: "Club fair follow-up",
  organizerFirstName: "Dana",
  loopUrl: "https://loop.example/l/fair",
  leaveUrl: "https://loop.example/l/fair/leave",
  crewFirstNames: ["Sarah", "Josh"],
  whenLabel: "Thu, Oct 22, 7:00 PM",
  timeLabel: "7:00 PM",
  dayWord: "Tomorrow",
  slotLabel: null,
  place: "Olin 245",
  linkedUrl: null,
  inCount: 0,
  inUrl: "https://loop.example/r/in-token",
  outUrl: "https://loop.example/r/out-token",
};

describe("reminderEmail", () => {
  it("renders a one-off loop with no slot line and no event line", () => {
    const { subject, html, text } = reminderEmail(base);
    expect(subject).toBe("Tomorrow: Club fair follow-up at 7:00 PM");
    for (const body of [html, text]) {
      expect(body).not.toContain("Meets:");
      expect(body).not.toContain("Event:");
      expect(body).toContain("Sarah and Josh");
      expect(body).toContain("Thu, Oct 22, 7:00 PM");
      expect(body).toContain("Olin 245");
      expect(body).toContain("0 people are in so far");
      expect(body).toContain("https://loop.example/r/in-token");
      expect(body).toContain("https://loop.example/r/out-token");
      expect(body).toContain("Dana");
      expect(body).toContain("https://loop.example/l/fair/leave");
    }
  });

  it("adds the slot and event lines for a weekly loop with a link", () => {
    const { html, text } = reminderEmail({
      ...base,
      slotLabel: "Thursdays · 7:00 PM",
      linkedUrl: "https://lu.ma/x",
      crewFirstNames: ["Sarah", "Josh", "Maya"],
      inCount: 1,
    });
    expect(text).toContain("Meets: Thursdays · 7:00 PM");
    expect(text).toContain("Event: https://lu.ma/x");
    expect(text).toContain("Sarah, Josh and Maya");
    expect(html).toContain('<a href="https://lu.ma/x">https://lu.ma/x</a>');
    expect(html).toContain("1 person is in so far");
  });

  it("shows a non-http(s) linked URL as text only, never as a link", () => {
    const { html, text } = reminderEmail({ ...base, linkedUrl: "javascript:alert(1)" });
    expect(html).not.toMatch(/href="javascript/i);
    expect(html).toContain("<strong>Event:</strong> javascript:alert(1)");
    expect(text).toContain("Event: javascript:alert(1)");
  });

  it("escapes HTML in user-entered facts", () => {
    const { html, text } = reminderEmail({ ...base, place: "Olin <b>245</b> & more" });
    expect(html).toContain("Olin &lt;b&gt;245&lt;/b&gt; &amp; more");
    expect(text).toContain("Olin <b>245</b> & more");
  });
});

describe("reminderEmail day word", () => {
  it("says Tomorrow in the subject and heading for a next-day meeting", () => {
    const { subject, html, text } = reminderEmail({ ...base, dayWord: "Tomorrow", timeLabel: "9:00 PM" });
    expect(subject).toBe("Tomorrow: Club fair follow-up at 9:00 PM");
    expect(html).toContain(">Club fair follow-up is tomorrow</h1>");
    expect(text.split("\n")[0]).toBe("Club fair follow-up is tomorrow.");
    expect(`${html}${text}`).not.toMatch(/tonight/i);
  });

  it("says Tonight in the subject and heading for a same-day meeting", () => {
    const { subject, html, text } = reminderEmail({ ...base, dayWord: "Tonight", timeLabel: "9:00 PM" });
    expect(subject).toBe("Tonight: Club fair follow-up at 9:00 PM");
    expect(html).toContain(">Club fair follow-up is tonight</h1>");
    expect(text.split("\n")[0]).toBe("Club fair follow-up is tonight.");
    expect(`${html}${text}`).not.toMatch(/tomorrow/i);
  });
});

describe("reminderEmail footer", () => {
  it("ends every variant's html and text with the loop footer and its /l/<slug>/leave link", () => {
    const variants: ReminderEmailInput[] = [
      base,
      { ...base, dayWord: "Tonight", slotLabel: "Thursdays · 7:00 PM", linkedUrl: "https://lu.ma/x" },
      { ...base, crewFirstNames: [], inCount: 3, loopTitle: "Tea & <talk>" },
    ];
    for (const input of variants) {
      const { html, text } = reminderEmail(input);
      expect(html).toContain(loopFooterHtml(input));
      expect(text.endsWith(loopFooterText(input))).toBe(true);
      expect(html).toContain('href="https://loop.example/l/fair/leave"');
      expect(text).toContain("Leave this loop: https://loop.example/l/fair/leave");
    }
  });
});
