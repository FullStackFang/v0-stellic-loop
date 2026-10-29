import { escapeHtml, loopFooterHtml, loopFooterText, type LoopFooterInput } from "@/lib/email";
import { httpUrl } from "@/lib/linkPreview";

/**
 * Day-before reminder (meeting-reminder "Day-before reminder"). A pure
 * function of already-formatted facts: crew first names, the meeting time in
 * the campus zone, the place, the effective linked event as a plain link
 * (preview fetch is deferred), the current In count for the crew, and the
 * two signed one-tap links. Ends with the loop footer.
 */

export interface ReminderEmailInput extends LoopFooterInput {
  /** Active members of the recipient's crew, recipient included. */
  crewFirstNames: string[];
  /** "Thu, Oct 22, 7:00 PM" in the campus zone. */
  whenLabel: string;
  /** "7:00 PM" in the campus zone, for the subject. */
  timeLabel: string;
  /** "Tonight" when the meeting is on the run's campus-local date, else "Tomorrow". */
  dayWord: "Tonight" | "Tomorrow";
  /** "Thursdays · 7:00 PM" for a weekly loop; null for a one-off, which gets no slot line. */
  slotLabel: string | null;
  place: string;
  /** Occurrence override, else the loop default, else null. */
  linkedUrl: string | null;
  /** Crew members who answered In for this occurrence. */
  inCount: number;
  inUrl: string;
  outUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "your crew";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function inCountLabel(count: number): string {
  return count === 1 ? "1 person is in so far" : `${count} people are in so far`;
}

export function reminderEmail(input: ReminderEmailInput): RenderedEmail {
  const subject = `${input.dayWord}: ${input.loopTitle} at ${input.timeLabel}`;
  const day = input.dayWord.toLowerCase();
  const names = joinNames(input.crewFirstNames);
  const inLine = inCountLabel(input.inCount);

  const html = [
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#222;max-width:560px">`,
    `<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(input.loopTitle)} is ${day}</h1>`,
    `<p style="margin:0 0 12px">Your crew: ${escapeHtml(names)}.</p>`,
    `<p style="margin:0 0 4px"><strong>When:</strong> ${escapeHtml(input.whenLabel)}</p>`,
    input.slotLabel === null
      ? ""
      : `<p style="margin:0 0 4px"><strong>Meets:</strong> ${escapeHtml(input.slotLabel)}</p>`,
    `<p style="margin:0 0 4px"><strong>Where:</strong> ${escapeHtml(input.place)}</p>`,
    input.linkedUrl === null
      ? ""
      : httpUrl(input.linkedUrl)
        ? `<p style="margin:0 0 4px"><strong>Event:</strong> <a href="${escapeHtml(input.linkedUrl)}">${escapeHtml(input.linkedUrl)}</a></p>`
        : // Not http(s): text only, never a link (save validates; this is the render-side check).
          `<p style="margin:0 0 4px"><strong>Event:</strong> ${escapeHtml(input.linkedUrl)}</p>`,
    `<p style="margin:12px 0">${escapeHtml(inLine)}. Are you coming?</p>`,
    `<p style="margin:0 0 16px">`,
    `<a href="${escapeHtml(input.inUrl)}" style="display:inline-block;padding:10px 18px;margin-right:8px;background:#1a7f37;color:#fff;text-decoration:none;border-radius:6px">I'm in</a>`,
    `<a href="${escapeHtml(input.outUrl)}" style="display:inline-block;padding:10px 18px;border:1px solid #999;color:#222;text-decoration:none;border-radius:6px">Can't make it</a>`,
    `</p>`,
    loopFooterHtml(input),
    `</div>`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const text = [
    `${input.loopTitle} is ${day}.`,
    ``,
    `Your crew: ${names}.`,
    `When: ${input.whenLabel}`,
    input.slotLabel === null ? null : `Meets: ${input.slotLabel}`,
    `Where: ${input.place}`,
    input.linkedUrl === null ? null : `Event: ${input.linkedUrl}`,
    ``,
    `${inLine}. Are you coming?`,
    `I'm in: ${input.inUrl}`,
    `Can't make it: ${input.outUrl}`,
    ``,
    loopFooterText(input),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { subject, html, text };
}
