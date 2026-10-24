// Every state change writes one event, inside the same transaction.
import type { Q } from "./db";
import { isShareToken } from "./tokens";
import type { EventType, Source } from "./types";

/** Cookie carrying how this visit entered: "group_link", "proposal_link:<token>", or a text source. */
export const ENTRY_COOKIE = "qe";

const ENTRY_SOURCES: Source[] = ["group_link", "digest_link", "on_text", "one_more_text", "maybe_nudge", "direct"];

/** The entry value for a landing URL: a share token wins, then a magic-link `src`, else the group link. */
export function entryFromUrl(params: URLSearchParams): string {
  const s = params.get("s");
  if (isShareToken(s)) return `proposal_link:${s}`;
  const src = params.get("src");
  if (src && (ENTRY_SOURCES as string[]).includes(src)) return src;
  return "group_link";
}

export type Attribution = { source: Source; shareId: string | null };

/** Resolve the entry cookie to an event source; an unknown share token falls back to the group link. */
export async function resolveSource(q: Q, entry: string | undefined | null): Promise<Attribution> {
  if (entry?.startsWith("proposal_link:")) {
    const token = entry.slice("proposal_link:".length);
    if (isShareToken(token)) {
      const { rows } = await q.query<{ id: string }>("select id from share where token = $1", [token]);
      if (rows[0]) return { source: "proposal_link", shareId: rows[0].id };
    }
    return { source: "group_link", shareId: null };
  }
  if (entry && (ENTRY_SOURCES as string[]).includes(entry)) return { source: entry as Source, shareId: null };
  return { source: "group_link", shareId: null };
}

export type EventInput = {
  /** null only for a code sent before its board exists */
  boardId: string | null;
  proposalId?: string | null;
  personId?: string | null;
  type: EventType;
  source: Source;
  shareId?: string | null;
  data?: Record<string, unknown>;
};

export async function writeEvent(q: Q, e: EventInput): Promise<void> {
  await q.query(
    `insert into event (board_id, proposal_id, person_id, type, source, share_id, data)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [e.boardId, e.proposalId ?? null, e.personId ?? null, e.type, e.source, e.shareId ?? null, JSON.stringify(e.data ?? {})],
  );
}
