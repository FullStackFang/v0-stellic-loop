// Writes that run as a known person inside a transaction. Actions resolve the
// person first (lib/identity.ts); verifyCode replays the same ops.
import "server-only";
import type { Q } from "./db";
import { countedDays, isValidDay, isWindowOver, todayIn, windowOf } from "./days";
import type { Attribution } from "./events";
import { writeEvent } from "./events";
import { DEFAULT_ICON, isIcon } from "./icons";
import { joinBoard } from "./identity";
import { boardById, freeDays, isUuid, personConflicts, proposalById } from "./load";
import { allocateBoard, slugify } from "./slug";
import type { Answer, Board, DetailKind, Proposal } from "./types";

export type OpError = { status: "error"; error: string };

/** Free days for the board's counted days (today or later in its window) minus days the person is ON for elsewhere. */
export async function attachableDays(q: Q, boardId: string, personId: string, proposalId: string | null) {
  const [board, all, conflicts] = await Promise.all([boardById(q, boardId), freeDays(q, boardId, personId), personConflicts(q, boardId, personId)]);
  const counted = new Set(board ? countedDays(board, todayIn(board.tz)) : []);
  const free = all.filter((d) => counted.has(d));
  const days = free.filter((d) => {
    const p = conflicts.get(d);
    return !p || p.id === proposalId;
  });
  const takenDay = free.find((d) => conflicts.has(d) && conflicts.get(d)!.id !== proposalId);
  return { days, conflict: takenDay ? { day: takenDay, title: conflicts.get(takenDay)!.title } : null };
}

export type RespondOk = {
  status: "ok";
  prev: Answer | null;
  next: Answer | null;
  days: string[];
  conflict: { day: string; title: string } | null;
  /** set when an `in` left an ON proposal: the poster is told, nobody else */
  dropped: { proposal: Proposal; count: number } | null;
};

/**
 * Set, change or (tapping the same answer again) clear an answer. `set` never
 * clears: a code replay was made on a device that did not know the old answer.
 */
export async function respondAs(q: Q, personId: string, proposalId: string, answer: Answer, attr: Attribution, mode: "toggle" | "set" = "toggle"): Promise<RespondOk | OpError> {
  if (!["in", "out", "maybe"].includes(answer)) return { status: "error", error: "bad_answer" };
  const p = await proposalById(q, proposalId, true);
  if (!p) return { status: "error", error: "not_found" };
  if (p.status === "closed") return { status: "error", error: "closed" };

  const { rows: had } = await q.query<{ answer: Answer }>(
    "select answer from response where proposal_id = $1 and person_id = $2",
    [p.id, personId],
  );
  const prev = had[0]?.answer ?? null;
  const next = prev === answer && mode === "toggle" ? null : answer;

  let days: string[] = [];
  let conflict: RespondOk["conflict"] = null;
  if (next === "in" && p.needs_day) ({ days, conflict } = await attachableDays(q, p.board_id, personId, p.id));

  if (next === null) {
    await q.query("delete from response where proposal_id = $1 and person_id = $2", [p.id, personId]);
  } else {
    await q.query(
      `insert into response (proposal_id, person_id, answer, days, updated_at) values ($1, $2, $3, $4, now())
       on conflict (proposal_id, person_id) do update set answer = excluded.answer, days = excluded.days, updated_at = now()`,
      [p.id, personId, next, days],
    );
  }
  await writeEvent(q, {
    boardId: p.board_id, proposalId: p.id, personId, type: "response",
    source: attr.source, shareId: attr.shareId, data: { prev, next },
  });
  await joinBoard(q, p.board_id, personId, p.id, attr);

  let dropped: RespondOk["dropped"] = null;
  if (p.status === "on" && prev === "in" && next !== "in") {
    const { rows } = await q.query<{ n: number }>(
      "select count(*)::int n from response where proposal_id = $1 and answer = 'in'", [p.id]);
    dropped = { proposal: p, count: rows[0].n };
  }
  return { status: "ok", prev, next, days, conflict, dropped };
}

export type PostInput = {
  title?: unknown;
  icon?: unknown;
  needsDay?: unknown;
  detail?: unknown;
  cost?: unknown;
  time?: unknown;
  min?: unknown;
  links?: unknown;
  versionOf?: unknown;
};

const text = (v: unknown, max: number) => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
};

export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** A short label for a link: host plus path, no scheme. */
export function linkLabel(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "").slice(0, 80);
}

export function parsePost(input: PostInput) {
  const title = text(input.title, 120);
  if (!title) return { error: "need_title" as const };
  const minRaw = typeof input.min === "number" ? input.min : typeof input.min === "string" && input.min.trim() ? Number(input.min) : null;
  if (minRaw !== null && (!Number.isInteger(minRaw) || minRaw < 1 || minRaw > 999)) return { error: "bad_min" as const };
  const links = (typeof input.links === "string" ? input.links.split(/\r?\n/) : [])
    .map((l) => l.trim()).filter(Boolean).slice(0, 10);
  const urls = links.map(normalizeUrl);
  if (urls.some((u) => !u)) return { error: "bad_link" as const };
  return {
    title,
    icon: isIcon(input.icon) ? input.icon : DEFAULT_ICON,
    needsDay: input.needsDay === undefined ? true : input.needsDay === true || input.needsDay === "on" || input.needsDay === "true",
    detail: text(input.detail, 200),
    cost: text(input.cost, 40),
    time: text(input.time, 40),
    min: minRaw,
    links: urls as string[],
    versionOf: isUuid(input.versionOf) ? input.versionOf : null,
  };
}

export type PostOk = { status: "ok"; proposalId: string };

/** Why a board takes no needs-a-day post today, if it doesn't: a fixed window that is over. */
export function postRefusal(board: Board, needsDay: boolean, today: string = todayIn(board.tz)): "dates_over" | null {
  return needsDay && isWindowOver(board, today) ? "dates_over" : null;
}

/** Create a proposal with the poster in (their free days attached) and links as details. */
export async function postAs(q: Q, personId: string, boardId: string, input: PostInput, attr: Attribution): Promise<PostOk | OpError> {
  const v = parsePost(input);
  if ("error" in v) return { status: "error", error: v.error! };
  const board = await boardById(q, boardId);
  if (!board) return { status: "error", error: "not_found" };
  const today = todayIn(board.tz);
  const refused = postRefusal(board, v.needsDay, today);
  if (refused) return { status: "error", error: refused };
  // A rolling board has no window end, so a needs-a-day post idles at the end of the window it was posted into.
  const deadline = v.needsDay && board.window_kind === "rolling" ? windowOf(board, today).end : null;
  let versionOf: string | null = null;
  if (v.versionOf) {
    const orig = await proposalById(q, v.versionOf);
    if (orig && orig.board_id === boardId) versionOf = orig.id;
  }
  const { rows } = await q.query<{ id: string }>(
    `insert into proposal (board_id, poster_id, title, icon, detail, cost_text, time_text, needs_day, min_count, version_of, deadline)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [boardId, personId, v.title, v.icon, v.detail, v.cost, v.time, v.needsDay, v.min, versionOf, deadline],
  );
  const id = rows[0].id;
  const days = v.needsDay ? (await attachableDays(q, boardId, personId, id)).days : [];
  await q.query("insert into response (proposal_id, person_id, answer, days) values ($1, $2, 'in', $3)", [id, personId, days]);
  for (const url of v.links) {
    await q.query("insert into proposal_detail (proposal_id, kind, text, url, added_by) values ($1, 'link', $2, $3, $4)",
      [id, linkLabel(url), url, personId]);
  }
  await writeEvent(q, {
    boardId, proposalId: id, personId, type: "proposal_posted", source: attr.source, shareId: attr.shareId,
    data: versionOf ? { version_of: versionOf } : {},
  });
  await joinBoard(q, boardId, personId, id, attr);
  return { status: "ok", proposalId: id };
}

export const BOARDS_PER_HOUR = 3;
export const DEFAULT_TZ = "America/New_York";

/** The visitor's IANA timezone, canonicalised, or New York when it isn't one. */
export function boardTz(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return DEFAULT_TZ;
  try {
    const tz = new Intl.DateTimeFormat("en-US", { timeZone: raw }).resolvedOptions().timeZone;
    return Intl.supportedValuesOf("timeZone").includes(tz) ? tz : DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

export const boardName = (v: unknown) => text(v, 60);

export type BoardOk = { status: "ok"; slug: string };

/**
 * Start a rolling board as this person: they join it, one `board_created`
 * event (source `direct`, never the entry attribution). At most
 * BOARDS_PER_HOUR per person, counted from the events so it holds across instances.
 */
export async function createBoardAs(q: Q, personId: string, rawName: unknown, rawTz: unknown): Promise<BoardOk | OpError> {
  const name = boardName(rawName);
  if (!name) return { status: "error", error: "need_board_name" };
  const { rows: [recent] } = await q.query<{ n: number }>(
    "select count(*)::int n from event where type = 'board_created' and person_id = $1 and at > now() - interval '1 hour'",
    [personId],
  );
  if (recent.n >= BOARDS_PER_HOUR) return { status: "error", error: "too_many_boards" };
  const board = await allocateBoard(q, slugify(name), { name, tz: boardTz(rawTz) });
  const direct: Attribution = { source: "direct", shareId: null };
  await joinBoard(q, board.id, personId, null, direct);
  await writeEvent(q, { boardId: board.id, personId, type: "board_created", ...direct, data: { window: "rolling" } });
  return { status: "ok", slug: board.slug };
}

export const validDays = (days: unknown): days is string[] => Array.isArray(days) && days.every(isValidDay);

const MAPS = /^(https?:\/\/)?(www\.)?(maps\.google\.|google\.[a-z.]+\/maps|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.apple\.com)/i;

/** What a line typed in the add row is: a place (map link), a link, or a note. */
export function classifyDetail(raw: string): { kind: DetailKind; text: string; url: string | null } {
  const s = raw.trim();
  const looksUrl = /^(https?:\/\/|www\.)/i.test(s) || /^[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(s);
  const url = looksUrl ? normalizeUrl(s) : null;
  if (url) return { kind: MAPS.test(s) ? "where" : "link", text: linkLabel(url), url };
  return { kind: "note", text: s.slice(0, 280), url: null };
}

