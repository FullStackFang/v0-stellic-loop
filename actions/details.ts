"use server";
import { db } from "@/lib/db";
import { attribution, sessionPersonId, setSession } from "@/lib/identity";
import { writeEvent } from "@/lib/events";
import { proposalById } from "@/lib/load";
import { classifyDetail } from "@/lib/ops";
import type { DetailKind } from "@/lib/types";
import { fail, type Fail } from "./results";

export type DetailResult = { status: "ok"; kind: DetailKind } | Fail;

/** Anyone in can add a link, a place or a note, attributed to them. Nobody is told. */
export async function addDetail(input: { proposalId: string; text: string; kind?: DetailKind }): Promise<DetailResult> {
  const me = await sessionPersonId();
  if (!me) return fail("signed_out");
  const raw = String(input.text ?? "").trim();
  if (!raw) return fail("bad_text");
  const d = classifyDetail(raw);
  if (input.kind === "where" && d.kind === "note") d.kind = "where";
  const out = await db().tx(async (q) => {
    const p = await proposalById(q, input.proposalId);
    if (!p) return fail("not_found");
    const { rows } = await q.query("select 1 from response where proposal_id = $1 and person_id = $2 and answer = 'in'", [p.id, me]);
    if (!rows.length) return fail("not_in");
    await q.query("insert into proposal_detail (proposal_id, kind, text, url, added_by) values ($1, $2, $3, $4, $5)",
      [p.id, d.kind, d.text, d.url, me]);
    const attr = await attribution(q);
    await writeEvent(q, { boardId: p.board_id, proposalId: p.id, personId: me, type: "detail_added", ...attr, data: { kind: d.kind } });
    return { status: "ok" as const, kind: d.kind };
  });
  if (out.status === "ok") await setSession(me);
  return out;
}

const FIXED = ["title", "min", "min_count", "cost", "cost_text", "needsDay", "needs_day"];

/** The poster edits the detail line and the time; nothing else, and nobody is told. */
export async function editProposal(input: { proposalId: string; detail?: string | null; time?: string | null } & Record<string, unknown>): Promise<{ status: "ok" } | Fail> {
  if (FIXED.some((k) => k in input)) return fail("fixed");
  const me = await sessionPersonId();
  if (!me) return fail("signed_out");
  const clean = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);
  const out = await db().tx(async (q) => {
    const p = await proposalById(q, input.proposalId, true);
    if (!p) return fail("not_found");
    if (p.poster_id !== me) return fail("not_poster");
    await q.query("update proposal set detail = $2, time_text = $3 where id = $1", [
      p.id,
      "detail" in input ? clean(input.detail, 200) : p.detail,
      "time" in input ? clean(input.time, 40) : p.time_text,
    ]);
    return { status: "ok" as const };
  });
  if (out.status === "ok") await setSession(me);
  return out;
}
