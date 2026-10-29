// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loopFooterHtml, loopFooterText } from "@/lib/email";
import { placementEmail, type PlacementEmailInput } from "@/lib/emails/placement";

const weekly: PlacementEmailInput = {
  loopTitle: "CS 2110 Thursday problem sets",
  organizerFirstName: "Dana",
  loopUrl: "https://loop.example/l/cs2110",
  leaveUrl: "https://loop.example/l/cs2110/leave",
  memberUrl: "https://loop.example/l/cs2110/me",
  crew: [
    { firstName: "Sarah", isYou: false },
    { firstName: "Josh", isYou: true },
    { firstName: "Maya", isYou: false },
  ],
  whenLabel: "Thu, Oct 22, 7:00 PM",
  slotLabel: "Thursdays · 7:00 PM",
  place: "Olin Library",
  linkedUrl: "https://lu.ma/x",
};

const oneOff: PlacementEmailInput = { ...weekly, slotLabel: null, linkedUrl: null };

describe("placementEmail", () => {
  it("renders a weekly loop with crew, meeting, slot, place, event link and member page", () => {
    const { subject, html, text } = placementEmail(weekly);
    expect(subject).toBe("You're in a crew for CS 2110 Thursday problem sets");
    for (const body of [html, text]) {
      expect(body).toContain("Sarah, Josh (you) and Maya");
      expect(body).toContain("Thu, Oct 22, 7:00 PM");
      expect(body).toContain("Thursdays · 7:00 PM");
      expect(body).toContain("Olin Library");
      expect(body).toContain("https://loop.example/l/cs2110/me");
    }
    expect(text).toContain("Meets: Thursdays · 7:00 PM");
    expect(text).toContain("Event: https://lu.ma/x");
    expect(html).toContain('<a href="https://lu.ma/x">https://lu.ma/x</a>');
    expect(html).toContain('href="https://loop.example/l/cs2110/me"');
  });

  it("gives a one-off loop no slot line, and no event line without a link", () => {
    const { html, text } = placementEmail(oneOff);
    for (const body of [html, text]) {
      expect(body).not.toContain("Meets:");
      expect(body).not.toContain("Event:");
      expect(body).toContain("Thu, Oct 22, 7:00 PM");
    }
  });

  it("says the date isn't set when there is no upcoming occurrence", () => {
    const { text } = placementEmail({ ...weekly, whenLabel: null });
    expect(text).toContain("Next meeting: The next date isn't set yet");
  });

  it("renders a non-http(s) linked URL as escaped text, never a link", () => {
    const { html, text } = placementEmail({ ...weekly, linkedUrl: "javascript:alert(1)" });
    expect(html).not.toContain("<a href=\"javascript:");
    expect(html).toContain("<strong>Event:</strong> javascript:alert(1)</p>");
    expect(text).toContain("Event: javascript:alert(1)");
  });

  it("escapes every user string in the HTML and keeps the text plain", () => {
    const { subject, html, text } = placementEmail({
      ...weekly,
      loopTitle: "Tea & <talk>",
      place: "Olin <b>245</b>",
      linkedUrl: 'https://x.example/?a=1&b="2"',
      crew: [{ firstName: "<script>Eve</script>", isYou: true }],
    });
    expect(subject).toBe("You're in a crew for Tea & <talk>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>245");
    expect(html).toContain("Tea &amp; &lt;talk&gt;");
    expect(html).toContain("Olin &lt;b&gt;245&lt;/b&gt;");
    expect(html).toContain("&lt;script&gt;Eve&lt;/script&gt; (you)");
    expect(html).toContain('href="https://x.example/?a=1&amp;b=&quot;2&quot;"');
    expect(text).toContain("Olin <b>245</b>");
  });

  it("ends with the loop footer and its leave link, and never mentions advising", () => {
    for (const input of [weekly, oneOff]) {
      const { html, text } = placementEmail(input);
      expect(html).toContain(loopFooterHtml(input));
      expect(text.endsWith(loopFooterText(input))).toBe(true);
      expect(text).toContain("Leave this loop: https://loop.example/l/cs2110/leave");
      expect(`${html}${text}`).not.toMatch(/advis|counsel/i);
    }
  });
});
