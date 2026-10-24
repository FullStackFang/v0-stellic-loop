// Quorum, implemented once. lock_proposal() (0005_boards.sql) mirrors `readiness`.
import { countedDays, fixedEnd, isPastEndOf, todayIn, windowDaysOf, type WindowBoard } from "./days";
import type { Board, Proposal, Response } from "./types";

export const DEFAULT_MIN = 4;

export type HeatCell = { day: string; count: number };
/** person id → days that person is ON for elsewhere (keyed by the ON proposal) */
export type Conflicts = Map<string, Map<string, Proposal>>;

export type State = "open" | "ready" | "on" | "idled" | "closed" | "past";

export function minOf(p: Pick<Proposal, "min_count">): number {
  return p.min_count ?? DEFAULT_MIN;
}

export function ins(rs: Response[]): Response[] {
  return rs.filter((r) => r.answer === "in");
}

export function maybes(rs: Response[]): Response[] {
  return rs.filter((r) => r.answer === "maybe");
}

/** The days a response counts for here: its days minus days its person is ON for elsewhere. */
export function effectiveDays(r: Response, conflicts?: Conflicts): string[] {
  const c = conflicts?.get(r.person_id);
  if (!c) return r.days;
  return r.days.filter((d) => {
    const other = c.get(d);
    return !other || other.id === r.proposal_id;
  });
}

/**
 * Count of `in` people per window day. Counts only, never who. Every window
 * day is a cell; a day before today stays at 0, so it is never best.
 */
export function heat(board: WindowBoard & Pick<Board, "tz">, rs: Response[], conflicts?: Conflicts, now: Date = new Date()): HeatCell[] {
  const today = todayIn(board.tz, now);
  const days = windowDaysOf(board, today);
  const counts = new Map(countedDays(board, today).map((d) => [d, 0]));
  for (const r of ins(rs)) {
    for (const d of new Set(effectiveDays(r, conflicts))) {
      if (counts.has(d)) counts.set(d, counts.get(d)! + 1);
    }
  }
  return days.map((d) => ({ day: d, count: counts.get(d) ?? 0 }));
}

/** Highest heat, earliest day on ties; null when nobody has a day. */
export function best(cells: HeatCell[]): HeatCell | null {
  let b: HeatCell | null = null;
  for (const c of cells) if (c.count > 0 && (!b || c.count > b.count)) b = c;
  return b;
}

/** How many more are needed before the ask (0 when ready). */
export function remaining(p: Proposal, board: Board, rs: Response[], conflicts?: Conflicts, now: Date = new Date()): number {
  const have = p.needs_day ? (best(heat(board, rs, conflicts, now))?.count ?? 0) : ins(rs).length;
  return Math.max(0, minOf(p) - have);
}

/**
 * The day an open proposal idles after: its deadline, else a fixed window's end
 * for needs-a-day, else never. Rolling boards set the deadline when posted.
 */
export function idledAt(p: Pick<Proposal, "deadline" | "needs_day">, board: WindowBoard): string | null {
  return p.deadline ?? (p.needs_day ? fixedEnd(board) : null);
}

export function isIdled(p: Proposal, board: Board, now: Date = new Date()): boolean {
  if (p.status !== "open") return false;
  const at = idledAt(p, board);
  return at !== null && isPastEndOf(at, board.tz, now);
}

/** Where a proposal stands for display. */
export function stateOf(p: Proposal, board: Board, rs: Response[], conflicts?: Conflicts, now: Date = new Date()): State {
  if (p.status === "closed") return "closed";
  if (p.status === "on") return p.on_day && isPastEndOf(p.on_day, board.tz, now) ? "past" : "on";
  if (isIdled(p, board, now)) return "idled";
  return remaining(p, board, rs, conflicts, now) === 0 ? "ready" : "open";
}

/**
 * Days a person is ON for: their `in` answers on ON proposals with a locked day.
 * Returns person id → (day → that ON proposal).
 */
export function conflictsFor(proposals: Proposal[], responses: Response[]): Conflicts {
  const byId = new Map(proposals.map((p) => [p.id, p]));
  const out: Conflicts = new Map();
  for (const r of responses) {
    const p = byId.get(r.proposal_id);
    if (!p || r.answer !== "in" || p.status !== "on" || !p.on_day) continue;
    if (!out.has(r.person_id)) out.set(r.person_id, new Map());
    const m = out.get(r.person_id)!;
    if (!m.has(p.on_day)) m.set(p.on_day, p);
  }
  return out;
}

/** The ON proposal (other than `exceptId`) that took one of `days` from this person, if any. */
export function conflictFor(personId: string, days: string[], conflicts: Conflicts, exceptId: string): { day: string; proposal: Proposal } | null {
  const c = conflicts.get(personId);
  if (!c) return null;
  for (const d of [...days].sort()) {
    const p = c.get(d);
    if (p && p.id !== exceptId) return { day: d, proposal: p };
  }
  return null;
}

export type BoardItem = { proposal: Proposal; responses: Response[] };
export type Sorted = { open: BoardItem[]; on: BoardItem[]; past: BoardItem[] };

/**
 * Open nearest-to-minimum first (ties newest), then ON (soonest day first,
 * no-day after), then past, idled and closed (most recent first).
 */
export function sortBoard(items: BoardItem[], board: Board, conflicts?: Conflicts, now: Date = new Date()): Sorted {
  const open: BoardItem[] = [];
  const rem = new Map<string, number>();
  const on: BoardItem[] = [];
  const past: BoardItem[] = [];
  for (const it of items) {
    const st = stateOf(it.proposal, board, it.responses, conflicts, now);
    if (st === "open" || st === "ready") {
      open.push(it);
      rem.set(it.proposal.id, remaining(it.proposal, board, it.responses, conflicts, now));
    }
    else if (st === "on") on.push(it);
    else past.push(it);
  }
  const newest = (a: BoardItem, b: BoardItem) => (a.proposal.created_at < b.proposal.created_at ? 1 : a.proposal.created_at > b.proposal.created_at ? -1 : 0);
  open.sort((a, b) => rem.get(a.proposal.id)! - rem.get(b.proposal.id)! || newest(a, b));
  on.sort((a, b) => {
    const x = a.proposal.on_day ?? "9999", y = b.proposal.on_day ?? "9999";
    return x < y ? -1 : x > y ? 1 : newest(a, b);
  });
  const ended = (it: BoardItem) => it.proposal.closed_at ?? it.proposal.on_day ?? it.proposal.deadline ?? it.proposal.created_at;
  past.sort((a, b) => (ended(a) < ended(b) ? 1 : ended(a) > ended(b) ? -1 : 0));
  return { open, on, past };
}

/**
 * The card's one row of seven: the first week of the window, or the second
 * when `focus` (the best or locked day) falls there.
 */
export function cardRow<T extends { day: string }>(cells: T[], focus: string | null): T[] {
  const i = focus ? cells.findIndex((c) => c.day === focus) : -1;
  const start = i >= 7 ? Math.floor(i / 7) * 7 : 0;
  return cells.slice(start, start + 7);
}
