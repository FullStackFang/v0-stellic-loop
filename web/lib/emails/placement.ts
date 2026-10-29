import { escapeHtml, loopFooterHtml, loopFooterText, type LoopFooterInput } from "@/lib/email";
import type { RenderedEmail } from "@/lib/emails/reminder";
import { httpUrl } from "@/lib/linkPreview";

/**
 * Placement notice (crew-formation "Members are told when placed"). A pure
 * function of already-formatted facts: the recipient's own crew by first
 * name with "(you)", the next meeting in the campus zone, the place, the
 * effective linked event as a plain link (preview fetch is deferred), the
 * weekly slot line (none for a one-off), and a link to the member page.
 * Ends with the loop footer. Nothing else about other members.
 */

export interface PlacementCrewMember {
  firstName: string;
  isYou: boolean;
}

export interface PlacementEmailInput extends LoopFooterInput {
  /** Active members of the recipient's crew, recipient included. */
  crew: PlacementCrewMember[];
  /** "Thu, Oct 22, 7:00 PM" in the campus zone; null when no upcoming occurrence exists yet. */
  whenLabel: string | null;
  /** "Thursdays · 7:00 PM" for a weekly loop; null for a one-off, which gets no slot line. */
  slotLabel: string | null;
  place: string;
  /** Occurrence override, else the loop default, else null. */
  linkedUrl: string | null;
  /** `${APP_URL}/l/<slug>/me`. */
  memberUrl: string;
}

const NO_DATE = "The next date isn't set yet";

function crewLine(crew: PlacementCrewMember[]): string {
  const names = crew.map((m) => (m.isYou ? `${m.firstName} (you)` : m.firstName));
  if (names.length === 0) return "your crew";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function placementEmail(input: PlacementEmailInput): RenderedEmail {
  const subject = `You're in a crew for ${input.loopTitle}`;
  const names = crewLine(input.crew);
  const when = input.whenLabel ?? NO_DATE;

  const html = [
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#222;max-width:560px">`,
    `<h1 style="font-size:20px;margin:0 0 12px">You're in a crew for ${escapeHtml(input.loopTitle)}</h1>`,
    `<p style="margin:0 0 12px">Your crew: ${escapeHtml(names)}.</p>`,
    `<p style="margin:0 0 4px"><strong>Next meeting:</strong> ${escapeHtml(when)}</p>`,
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
    `<p style="margin:16px 0">`,
    `<a href="${escapeHtml(input.memberUrl)}" style="display:inline-block;padding:10px 18px;background:#1a7f37;color:#fff;text-decoration:none;border-radius:6px">See your crew</a>`,
    `</p>`,
    loopFooterHtml(input),
    `</div>`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const text = [
    `You're in a crew for ${input.loopTitle}.`,
    ``,
    `Your crew: ${names}.`,
    `Next meeting: ${when}`,
    input.slotLabel === null ? null : `Meets: ${input.slotLabel}`,
    `Where: ${input.place}`,
    input.linkedUrl === null ? null : `Event: ${input.linkedUrl}`,
    ``,
    `See your crew: ${input.memberUrl}`,
    ``,
    loopFooterText(input),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { subject, html, text };
}
