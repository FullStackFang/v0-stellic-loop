import { dayNum, dow, mon } from "./days";
import type { BoardData } from "./load";
import { best, heat, ins, minOf, stateOf } from "./quorum";
import type { Proposal, Response } from "./types";
import { hourOf } from "./hour";
import type { Sky } from "./solar";
export type Viewer = { id: string; show_name: boolean } | null;
export type PlanFace = { id: string; name: string; initial: string };
export type PlanModel = {
  id: string; title: string; state: "open" | "formed" | "didnt_form" | "past" | "closed";
  count: number; threshold: number; remaining: number; lead: string; day: string | null;
  when: string; place: string | null; time: string | null; hour: number; sky: Sky;
  faces: PlanFace[]; dropped: PlanFace[]; me: "in" | "out" | null; posterId: string | null;
  deadline: string | null; temperature?: number;
};

export function planModel(p: Proposal, data: BoardData, viewer: Viewer, now = new Date()): PlanModel {
  const rs = data.responses.filter(r => r.proposal_id === p.id);
  const raw = stateOf(p, data.board, rs, data.conflicts, now);
  const state = raw === "on" ? "formed" : raw === "idled" ? "didnt_form" : raw === "ready" ? "open" : raw;
  const legacy = p.needs_day ? best(heat(data.board, rs, data.conflicts, now)) : null;
  const day = p.on_day ?? p.day ?? legacy?.day ?? null;
  const count = ins(rs).length, threshold = minOf(p), remaining = Math.max(0, threshold - (p.needs_day && state === "open" ? legacy?.count ?? 0 : count));
  const face = (r: Response): PlanFace => {
    const person = data.people.get(r.person_id);
    const name = r.person_id === viewer?.id ? "You" : person?.show_name ? person.name.trim().split(/\s+/)[0] : "";
    return { id: r.person_id, name, initial: name.slice(0, 1).toUpperCase() };
  };
  const mine = rs.find(r => r.person_id === viewer?.id)?.answer;
  return {
    id: p.id, title: p.title, state, count, threshold, remaining,
    lead: state === "formed" || state === "past" ? "formed" : state === "didnt_form" || state === "closed" ? "closed" : remaining === 1 ? "one more" : `${remaining} more`,
    day, when: [day ? `${dow(day)} ${dayNum(day)} ${mon(day)}` : "Any day", p.time_text].filter(Boolean).join(", "),
    place: p.place ?? null, time: p.time_text, hour: hourOf(p.time_text), sky: "clear",
    faces: ins(rs).sort((a, b) => Number(b.person_id === viewer?.id) - Number(a.person_id === viewer?.id)).map(face),
    dropped: p.on_at ? rs.filter(r => r.answer === "out" && data.droppedAfterFormation?.has(`${p.id}:${r.person_id}`)).map(face) : [],
    me: mine === "in" || mine === "out" ? mine : null, posterId: p.poster_id, deadline: p.deadline,
  };
}
