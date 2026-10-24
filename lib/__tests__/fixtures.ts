import type { Answer, Board, Proposal, Response } from "../types";

export const BOARD: Board = {
  id: "b",
  slug: "emba27",
  name: "EMBA '27",
  tz: "America/New_York",
  window_kind: "fixed",
  window_start: "2027-02-14",
  window_end: "2027-02-20",
};

/** Before the window, so nothing is idled. */
export const NOW = new Date("2027-01-10T12:00:00Z");

let n = 0;
export function prop(over: Partial<Proposal> = {}): Proposal {
  n++;
  return {
    id: `p${n}`,
    board_id: "b",
    poster_id: "poster",
    title: `P${n}`,
    icon: "confetti",
    detail: null,
    cost_text: null,
    time_text: null,
    needs_day: true,
    min_count: null,
    deadline: null,
    status: "open",
    on_day: null,
    on_at: null,
    locked_by: null,
    closed_at: null,
    version_of: null,
    created_at: `2026-11-01T00:00:${String(n % 60).padStart(2, "0")}.000Z`,
    ...over,
  };
}

export function resp(proposalId: string, personId: string, answer: Answer, days: string[] = []): Response {
  return { proposal_id: proposalId, person_id: personId, answer, days, updated_at: "2026-11-01T00:00:00.000Z" };
}

export const D = { sun: "2027-02-14", mon: "2027-02-15", tue: "2027-02-16", wed: "2027-02-17", thu: "2027-02-18", fri: "2027-02-19", sat: "2027-02-20" };

/** `k` people in with `days` each */
export function crowd(p: Proposal, k: number, days: string[], prefix = "x"): Response[] {
  return Array.from({ length: k }, (_, i) => resp(p.id, `${prefix}${i}`, "in", days));
}
