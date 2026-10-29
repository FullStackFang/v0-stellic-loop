import type { Intent } from "@/lib/loops";

/**
 * Organizer constants and pure validators that both server code and client
 * components use. No server imports here (type-only imports are erased), so
 * a client component can import this module safely.
 */

export type DropKind = "group_chat" | "pin" | "person" | "event_page" | "qr";

export const DROP_KINDS: ReadonlyArray<{ kind: DropKind; label: string }> = [
  { kind: "group_chat", label: "Group chat" },
  { kind: "pin", label: "Pin" },
  { kind: "person", label: "Person" },
  { kind: "event_page", label: "Event page" },
  { kind: "qr", label: "QR code" },
];

export function isDropKind(value: unknown): value is DropKind {
  return DROP_KINDS.some((k) => k.kind === value);
}

export function dropKindLabel(kind: DropKind): string {
  return DROP_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

/** ISO weekdays (1 = Monday ... 7 = Sunday) in display order, Monday first. */
export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
].map((label, i) => ({ value: i + 1, label }));

/** Dashboard groups, in display order. Eligible for a crew = the first two. */
export const INTENT_GROUPS: ReadonlyArray<{ intent: Intent; label: string; eligible: boolean }> = [
  { intent: "crew_conditional", label: "In if there's a crew", eligible: true },
  { intent: "going_want_crew", label: "Going anyway", eligible: true },
  { intent: "watching", label: "Watching", eligible: false },
];

export const PARTIFUL_NOTE = "Partiful: link and preview only, guest sync not available";

/** `raw` as a normalized absolute http(s) URL, or null when it is anything else. */
export function parseHttpUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.href;
}

/** True for `partiful.com` and its subdomains; false for anything unparsable. */
export function isPartifulUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === "partiful.com" || host.endsWith(".partiful.com");
}
