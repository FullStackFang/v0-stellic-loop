// Loads everything the proposal page and its metadata render from.
import "server-only";
import { cache } from "react";
import type { PlanPageModel } from "@/components/PlanView";
import { db } from "./db";
import { boardById, boardData, detailsFor, proposalById } from "./load";
import { planModel } from "./view";
import { forecast } from "./forecast";
import { viewer } from "./viewer";

export const loadProposalPage = cache(async (id: string): Promise<(PlanPageModel & { responseCount: number }) | null> => {
  const q = db();
  const p = await proposalById(q, id);
  if (!p) return null;
  const board = (await boardById(q, p.board_id))!;
  const [data, who, details] = await Promise.all([boardData(q, board), viewer(q), detailsFor(q, p.id)]);
  const me = who;
  const c = planModel(p, data, me);
  Object.assign(c, await forecast(board, c.day));
  const nameOf = (pid: string | null) => {
    if (!pid) return null;
    if (me && pid === me.id) return "You";
    const person = data.people.get(pid);
    return person ? (person.show_name ? person.name.trim().split(/\s+/)[0] : "+1 anonymous") : null;
  };
  return {
    board,
    c,
    details: details.map((d) => ({ k: d.kind, text: d.text, url: d.url, by: nameOf(d.added_by) })),
    viewerName: me?.name ?? null,
    signedIn: !!me,
    isPoster: !!me && p.poster_id === me.id,
    responseCount: c.count,
  };
});
