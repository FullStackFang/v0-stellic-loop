// Shapes the client components read back from actions.
import { IDENTITY_ERRORS, type Who } from "@/lib/identity";

export type Fail = { status: "error"; error: string; message: string };
export type NeedsCode = { status: "needs_code"; phone: string };

const MESSAGES: Record<string, string> = {
  ...IDENTITY_ERRORS,
  not_found: "That's gone.",
  closed: "The poster closed this one.",
  bad_answer: "Pick in, maybe or out.",
  need_title: "Give it a title.",
  bad_min: "The number should be a whole number, 1 or more.",
  bad_link: "One of the links doesn't look like a web address.",
  not_in: "Tap in first.",
  not_ready: "Not enough overlap yet.",
  not_poster: "Only the poster can do that.",
  fixed: "Title, number, cost and the day switch are fixed once posted. Post a version instead.",
  not_idled: "Only an idled proposal can be reopened.",
  not_lower: "Reopen at a lower number than before.",
  window_over: "The window is over; post a new one instead.",
  not_higher: "Reopen at the same number or lower.",
  dates_over: "This board's dates are over.",
  need_board_name: "Give the board a name.",
  too_many_boards: "Too many new boards. Try again in an hour.",
  bad_day: "That day isn't in the window.",
  signed_out: "Answer something first so we know who you are.",
  rate_limited: "Too many tries. Wait a minute.",
  expired: "That code expired. Tap again for a new one.",
  wrong_code: "That code isn't right.",
  code_check_failed: "We couldn't check that code. Try again.",
  too_many: "Too many wrong codes. Tap again for a new one.",
  bad_text: "Add some text.",
};

export function fail(error: string): Fail {
  return { status: "error", error, message: MESSAGES[error] ?? "Something went wrong." };
}

export function fromWho(who: Extract<Who, { kind: "error" | "needs_code" }>): Fail | NeedsCode {
  return who.kind === "needs_code" ? { status: "needs_code", phone: who.phone } : fail(who.error);
}
