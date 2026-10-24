// What a card and the proposal page show, computed once from rows. Pure, so
// pages stay thin and the copy is unit-tested. Mirrors quorum.html v5's
// factsFor / dateFor / pileFor / ask.
import { countedDays, dayNames, dayNum, dow, longLabel, mon, shortLabel, todayIn, windowOf } from "./days";
import type { BoardData } from "./load";
import { best, conflictFor, effectiveDays, heat, ins, maybes, minOf, stateOf, type State } from "./quorum";
import type { Answer, Board, Person, Proposal, Response } from "./types";

export type DateBlock = { cls: "" | "ready" | "on" | "none"; small: string; big: string; sub: string };
export type HeatView = { day: string; letter: string; count: number; best: boolean; on: boolean; you: boolean }[];
export type Face = { initial: string; cls: "" | "me" | "more" };
export type AskView = { count: number; of: number; dayLong: string | null; cta: string };
/** `anon`: their name switch is off, so the row never names them. */
export type PersonRow = { name: string; me: boolean; anon: boolean; days: string };

export type CardModel = {
  id: string;
  title: string;
  icon: string;
  state: State;
  needsDay: boolean;
  date: DateBlock;
  chip: "ready" | "on" | null;
  facts: { strong: string | null; text: string };
  heat: HeatView | null;
  ask: AskView | null;
  faces: Face[];
  more: number;
  who: string;
  me: Answer | null;
  myDays: string[];
  conflict: string | null;
  inCount: number;
  maybeCount: number;
  min: number;
  cost: string | null;
  time: string | null;
  detail: string | null;
  posterId: string | null;
  posterName: string | null;
  lockedByName: string | null;
  onDay: string | null;
  bestDay: string | null;
  bestCount: number;
};

/** `free`: the viewer's free days on this board, so a day taken by an ON proposal can be explained. */
export type Viewer = { id: string; show_name: boolean; free?: string[] } | null;
type People = BoardData["people"];

const nameOf = (people: People, id: string | null, viewer: Viewer): string | null => {
  if (!id) return null;
  if (viewer && id === viewer.id) return "You";
  const p = people.get(id);
  if (!p) return null;
  return p.show_name ? p.name : "someone";
};

const join = (...xs: (string | null | undefined | false)[]) => xs.filter(Boolean).join(" · ");

export function cardModel(p: Proposal, data: BoardData, viewer: Viewer, now: Date = new Date()): CardModel {
  const rs = data.responses.filter((r) => r.proposal_id === p.id);
  const state = stateOf(p, data.board, rs, data.conflicts, now);
  const cells = heat(data.board, rs, data.conflicts, now);
  const counted = new Set(countedDays(data.board, todayIn(data.board.tz, now)));
  const b = best(cells);
  const inRs = ins(rs);
  const n = inRs.length;
  const m = maybes(rs).length;
  const min = minOf(p);
  const mine = viewer ? rs.find((r) => r.person_id === viewer.id) ?? null : null;
  const myDays = mine?.answer === "in" ? effectiveDays(mine, data.conflicts).filter((d) => counted.has(d)) : [];
  const lockedByName = nameOf(data.people, p.locked_by, viewer);
  const isOn = state === "on" || (state === "past" && p.status === "on");

  // date block
  let date: DateBlock;
  if (isOn) date = p.on_day ? { cls: "on", small: mon(p.on_day), big: String(dayNum(p.on_day)), sub: dow(p.on_day) } : { cls: "on", small: "Any", big: "On", sub: "" };
  else if (!p.needs_day) date = { cls: "none", small: "Any", big: "No day", sub: "" };
  else if (!b) date = { cls: "none", small: mon(windowOf(data.board, todayIn(data.board.tz, now)).start), big: "No days yet", sub: "" };
  else date = { cls: state === "ready" ? "ready" : "", small: mon(b.day), big: String(dayNum(b.day)), sub: dow(b.day) };

  const chip = state === "on" ? "on" : state === "ready" ? "ready" : null;

  // facts line
  let facts: CardModel["facts"];
  if (state === "on") facts = { strong: null, text: join(p.time_text, p.cost_text, lockedByName && `${lockedByName} locked it`) };
  else if (state === "past") facts = { strong: null, text: join(p.on_day ? `Happened ${shortLabel(p.on_day)}` : "Happened", p.time_text) };
  else if (state === "closed") facts = { strong: null, text: "Closed by the poster" };
  else if (state === "idled") facts = { strong: null, text: `Didn't reach ${min}` };
  else if (p.needs_day) {
    if (state === "ready" && b) facts = { strong: `${b.count} of ${n}`, text: join(`can do ${dow(b.day)}`, p.cost_text, p.time_text) };
    else facts = { strong: `${b?.count ?? 0} of ${min}`, text: join(b ? `on ${dow(b.day)}` : "no days yet", p.cost_text, p.min_count != null && `needs ${p.min_count}`) };
  } else if (state === "ready") facts = { strong: `${n} in`, text: p.cost_text ?? "" };
  else facts = { strong: `${n} of ${min}`, text: join("in", p.cost_text) };

  // heat: open needs-a-day only on cards (the page also shows it locked)
  const heatView: HeatView | null = p.needs_day
    ? cells.map((c) => ({
        day: c.day,
        letter: dow(c.day)[0],
        count: c.count,
        best: !isOn && state !== "idled" && b?.day === c.day,
        on: isOn && p.on_day === c.day,
        you: myDays.includes(c.day),
      }))
    : null;

  const ask: AskView | null =
    state === "ready"
      ? p.needs_day && b
        ? { count: b.count, of: n, dayLong: longLabel(b.day), cta: "Lock it in" }
        : { count: n, of: n, dayLong: null, cta: "It's on" }
      : null;

  // faces: you first, then names, anonymous as "+"
  const order = [...inRs].sort((x, y) => (viewer && x.person_id === viewer.id ? -1 : viewer && y.person_id === viewer.id ? 1 : 0));
  const allFaces: Face[] = order.map((r) => {
    if (viewer && r.person_id === viewer.id) return { initial: "Y", cls: "me" };
    const person = data.people.get(r.person_id);
    return person?.show_name ? { initial: person.name.slice(0, 1).toUpperCase(), cls: "" } : { initial: "+", cls: "more" };
  });
  const faces = allFaces.slice(0, 4);
  const posterName = nameOf(data.people, p.poster_id, viewer);
  const who = n ? join(`${n} in`, m > 0 && `${m} maybe`) : join(posterName ? `Nobody yet · ${posterName} posted` : "Nobody yet", m > 0 && `${m} maybe`);

  let conflict: string | null = null;
  if (viewer && mine?.answer === "in" && p.needs_day && state !== "on") {
    const c = conflictFor(viewer.id, [...new Set([...mine.days, ...(viewer.free ?? [])])].filter((d) => counted.has(d)), data.conflicts, p.id);
    if (c) conflict = `${c.proposal.title} ${shortLabel(c.day)}`;
  }

  return {
    id: p.id, title: p.title, icon: p.icon, state, needsDay: p.needs_day, date, chip, facts, heat: heatView, ask,
    faces, more: allFaces.length - faces.length, who, me: mine?.answer ?? null, myDays, conflict,
    inCount: n, maybeCount: m, min, cost: p.cost_text, time: p.time_text, detail: p.detail,
    posterId: p.poster_id, posterName, lockedByName, onDay: p.on_day, bestDay: b?.day ?? null, bestCount: b?.count ?? 0,
  };
}

/** In and Maybe lists for the proposal page, honouring each person's name switch; days listed are counted days only. */
export function peopleLists(p: Proposal, rs: Response[], people: BoardData["people"], viewer: Viewer, conflicts: BoardData["conflicts"], board: Board, now: Date = new Date()) {
  const counted = new Set(countedDays(board, todayIn(board.tz, now)));
  const row = (r: Response): PersonRow => {
    const me = !!viewer && r.person_id === viewer.id;
    const person = people.get(r.person_id) as Pick<Person, "name" | "show_name"> | undefined;
    const anon = me ? !viewer!.show_name : !person?.show_name;
    const name = me ? (viewer!.show_name ? "You" : "You (+1 anonymous)") : person?.show_name ? person.name : "+1 anonymous";
    const days = r.answer === "in" && p.needs_day && p.status === "open"
      ? dayNames(effectiveDays(r, conflicts).filter((d) => counted.has(d))).join(" ")
      : "";
    return { name, me, anon, days };
  };
  const mine = (r: Response) => (viewer && r.person_id === viewer.id ? 0 : 1);
  return {
    in: ins(rs).filter((r) => r.proposal_id === p.id).sort((a, b) => mine(a) - mine(b)).map(row),
    maybe: maybes(rs).filter((r) => r.proposal_id === p.id).sort((a, b) => mine(a) - mine(b)).map(row),
  };
}

/**
 * The copyable roster: "Ski trip · 5 in" and "Priya, Marcus, Dana and 2 more ·
 * Maybe: Hana". The viewer is copied under their own name; anyone with their
 * name switch off is only counted. Never a number.
 */
export function rosterText(title: string, lists: { in: PersonRow[]; maybe: PersonRow[] }, viewerName: string | null): string {
  const names = (rows: PersonRow[]) => {
    const named = rows.filter((r) => !r.anon).map((r) => (r.me ? viewerName ?? "Me" : r.name));
    const more = rows.length - named.length;
    if (!more) return named.join(", ");
    return named.length ? `${named.join(", ")} and ${more} more` : `${more} more`;
  };
  const line = lists.maybe.length ? `${names(lists.in)} · Maybe: ${names(lists.maybe)}` : names(lists.in);
  return `${title} · ${lists.in.length} in
${line}`;
}

/** "6 of 8 in · Suits in Hoi An · Tue 16" for og:title and the OG image. */
export function countLine(c: CardModel): string {
  const count = c.state === "on" || c.state === "past" ? `${c.inCount} in · On` : `${c.inCount} of ${c.min} in`;
  const day = c.onDay ?? (c.needsDay ? c.bestDay : null);
  return join(count, c.title, day && shortLabel(day));
}

export function heroCounts(models: CardModel[]) {
  return {
    open: models.filter((m) => m.state === "open" || m.state === "ready").length,
    on: models.filter((m) => m.state === "on").length,
  };
}
