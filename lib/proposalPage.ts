// Loads everything the proposal page and its metadata render from.
import "server-only";
import { cache } from "react";
import type { ProposalPageModel } from "@/components/ProposalView";
import { db } from "./db";
import { boardById, boardData, detailsFor, freeDays, proposalById } from "./load";
import { cardModel, peopleLists } from "./view";
import { viewer } from "./viewer";

export const loadProposalPage = cache(async (id: string): Promise<(ProposalPageModel & { responseCount: number }) | null> => {
  const q = db();
  const p = await proposalById(q, id);
  if (!p) return null;
  const board = (await boardById(q, p.board_id))!;
  const [data, who, details] = await Promise.all([boardData(q, board), viewer(q), detailsFor(q, p.id)]);
  const me = who && { ...who, free: await freeDays(q, board.id, who.id) };
  const c = cardModel(p, data, me);
  const rs = data.responses.filter((r) => r.proposal_id === p.id);
  const nameOf = (pid: string | null) => {
    if (!pid) return null;
    if (me && pid === me.id) return "You";
    const person = data.people.get(pid);
    return person ? (person.show_name ? person.name : "+1 anonymous") : null;
  };
  return {
    board,
    c,
    details: details.map((d) => ({ k: d.kind, text: d.text, url: d.url, by: nameOf(d.added_by) })),
    people: peopleLists(p, rs, data.people, me, data.conflicts, board),
    viewerName: me?.name ?? null,
    signedIn: !!me,
    isPoster: !!me && p.poster_id === me.id,
    responseCount: rs.length,
  };
});
