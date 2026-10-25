// The words of every text, once. Plain ASCII so each stays GSM-7; with a
// 60-character link and the longest title, none passes two segments.
import { shortLabel } from "../days";

const POST_YOURS = "Got an idea? Post it on the board.";

export function codeText(code: string): string {
  return `Quorum code: ${code}. It expires in 10 minutes.`;
}

/** An `in` whose days include the locked day. `time` only when set. */
export function onText(title: string, day: string, time: string | null, n: number, link: string): string {
  return `${title} is on: ${shortLabel(day)}${time ? `, ${time}` : ""}. ${n} in. ${link} ${POST_YOURS}`;
}

/** An `in` whose days missed the locked day. */
export function onMissedText(title: string, day: string, n: number, link: string): string {
  return `${title} is on for ${shortLabel(day)}, a day you didn't pick. ${n} in. Still in? ${link}`;
}

/** An `in` on an intent with no day. */
export function onNoDayText(title: string, n: number, link: string): string {
  return `${title} is on. ${n} in. ${link} ${POST_YOURS}`;
}

export function maybeText(title: string, n: number, link: string): string {
  return `${title} is on. ${n} in. You said maybe. In? ${link}`;
}

/** `name` is null when the person's name is off. */
export function dropText(name: string | null, title: string, n: number, link: string): string {
  return `${name ?? "Someone"} dropped out of ${title}. ${n} in. ${link}`;
}

export function oneMoreText(n: number, min: number, title: string, link: string): string {
  const k = min - n;
  return `${n} of ${min} for ${title}. ${k === 1 ? "One more" : `${k} more`} and it's on. Send it to someone: ${link}`;
}
