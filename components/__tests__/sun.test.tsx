import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Faces } from "../Faces";
import { Count } from "../Count";
import { PlanRow } from "../PlanRow";
import { planModel } from "@/lib/view";
import { BOARD, NOW, prop, crowd } from "@/lib/__tests__/fixtures";

it("shows a count and the one remaining slot", () => {
  render(<><Count count={3} threshold={4} lead="one more" /><Faces faces={[{ id:'1',name:'Marcus',initial:'M' }]} remaining={1} /></>);
  expect(screen.getByText('of 4')).toBeInTheDocument();
  expect(screen.getByText('Marcus')).toBeInTheDocument();
  expect(screen.getByText('+1')).toBeInTheDocument();
});
it("caps faces at six and labels overflow", () => {
  render(<Faces faces={Array.from({length:7},(_,i)=>({id:String(i),name:`Person${i}`,initial:'P'}))} remaining={0} />);
  expect(screen.getByText('+1 more')).toBeInTheDocument();
  expect(screen.queryByText('Person6')).not.toBeInTheDocument();
});
it("uses smaller rings for five people and one remaining place", () => {
  const { container } = render(<><Count count={5} threshold={6} lead="one more" /><Faces faces={Array.from({ length: 5 }, (_, i) => ({ id: String(i), name: `Person${i}`, initial: 'P' }))} remaining={1} /></>);
  expect(container.querySelector('.faces.many')).toBeTruthy();
  expect(container.querySelectorAll('.bars .f')).toHaveLength(5);
  expect(screen.getByText('+1')).toBeInTheDocument();
});
it.each(['open','on','closed'] as const)("renders a linked %s row", status => {
  const p=prop({status,needs_day:false});
  const c=planModel(p,{board:BOARD,proposals:[p],responses:crowd(p,3,[]),people:new Map(),conflicts:new Map()},null,NOW);
  render(<PlanRow plan={c} />);
  expect(screen.getByRole('link')).toHaveAttribute('href',`/p/${p.id}`);
});
