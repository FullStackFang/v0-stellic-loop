// Every message the product sends, named once. TextNotifier (text.ts) turns
// each into one text per recipient; the transport is a log line or Twilio.
// For now only sign-in codes are texted (Verify); the rest stay log lines.
import type { Q } from "../db";
import { LogNotifier } from "./text";
import { TwilioNotifier, twilioConfig } from "./twilio";
import { VerifyNotifier, verifyConfig } from "./verify";

export { LogNotifier, TwilioNotifier, VerifyNotifier };

type Base = { boardId: string; proposalId: string; title: string; url: string };

export type OnReached = Base & {
  onDay: string | null;
  timeText: string | null;
  lockedBy: string;
  /** everyone in */
  yeses: string[];
  /** in, but their days did not include the locked day */
  cantMakeIt: string[];
  maybes: string[];
};
/** Each recipient carries the share link minted for them. */
export type OneMore = Base & { to: { personId: string; url: string }[]; count: number; min: number };
export type MaybeNudge = Base & { to: string[]; count: number };
export type Dropped = Base & { to: string; who: string; count: number };
/** `boardId` is null for a code asked for while starting a board; `personId` is null for a number we don't know yet. */
export type Code = { boardId: string | null; personId: string | null; phone: string; code: string };

export interface Notifier {
  onReached(m: OnReached): Promise<void>;
  oneMore(m: OneMore): Promise<void>;
  maybeNudge(m: MaybeNudge): Promise<void>;
  dropped(m: Dropped): Promise<void>;
  /** `sent: false` when the code could not be texted; the caller must not wait for it. */
  code(m: Code): Promise<{ sent: boolean }>;
}

/** Verify when its variables are set, else Twilio when its are, else the log. */
function byEnv(q: Q): Notifier {
  const verify = verifyConfig(process.env);
  if (verify) return new VerifyNotifier(q, verify);
  const cfg = twilioConfig(process.env);
  return cfg ? new TwilioNotifier(q, cfg) : new LogNotifier(q);
}

let factory: (q: Q) => Notifier = byEnv;

export function notifier(q: Q): Notifier {
  return factory(q);
}

/** Tests swap in a spy. */
export function setNotifier(f: ((q: Q) => Notifier) | null) {
  factory = f ?? byEnv;
}
