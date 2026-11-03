import { expect, it } from "vitest";
import { planModel } from "../view";
import { BOARD, NOW, prop, crowd, resp, D } from "./fixtures";
import type { BoardData } from "../load";

it.each([['open','open'], ['on','formed'], ['closed','closed']] as const)("maps %s to %s", (status, state) => {
  const p = prop({ status, needs_day: false, day: D.fri, time_text: "6pm", place: "Pier" });
  const data: BoardData = { board: BOARD, proposals: [p], responses: crowd(p, 3, []), people: new Map(), conflicts: new Map() };
  expect(planModel(p, data, null, NOW)).toMatchObject({ state, count: 3, threshold: 4, hour: 18, day: D.fri, place: "Pier" });
});
it("uses the legacy best day and first names with the viewer first", () => {
  const p = prop();
  const data: BoardData = { board: BOARD, proposals: [p], responses: crowd(p, 2, [D.mon]), people: new Map([['x0', { id:'x0', name:'Marcus Lee', show_name:true }]]), conflicts:new Map() };
  const model = planModel(p, data, { id:'x1', show_name:true }, NOW);
  expect(model.day).toBe(D.mon);
  expect(model.faces.map(f=>f.name)).toEqual(['You','Marcus']);
});
it("distinguishes didn't form from happened and folds ready into open", () => {
  const p = prop({ needs_day:false, deadline:'2027-01-01' });
  const data: BoardData = { board:BOARD, proposals:[p], responses:crowd(p,4,[]), people:new Map(), conflicts:new Map() };
  expect(planModel(p,data,null,NOW).state).toBe('didnt_form');
  expect(planModel({...p,deadline:null},data,null,NOW).state).toBe('open');
  expect(planModel({...p,status:'on',on_day:'2027-01-01'},data,null,NOW).state).toBe('past');
});

it("shows only people who dropped after formation, respecting hidden names", () => {
  const p = prop({ status: "on", needs_day: false, on_at: NOW.toISOString() });
  const data: BoardData = { board: BOARD, proposals: [p], responses: [resp(p.id, "a", "out"), resp(p.id, "b", "out")], people: new Map([["a", { id: "a", name: "Private Name", show_name: false }]]), conflicts: new Map(), droppedAfterFormation: new Set([`${p.id}:a`]) };
  expect(planModel(p, data, null, NOW).dropped).toEqual([{ id: "a", name: "", initial: "" }]);
});
