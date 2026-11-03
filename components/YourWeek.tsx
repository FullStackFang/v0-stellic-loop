import type { Board } from "@/lib/types";
import type { PlanModel, Viewer } from "@/lib/view";
import { todayIn } from "@/lib/days";
import { PlanRow } from "./PlanRow";
import { OptIn } from "./OptIn";
import { ShowNameSwitch } from "./ShowNameSwitch";
export function YourWeek({ board, me, plans, share }: { board: Board; me: Viewer; plans: PlanModel[]; share: boolean }) {
  if (!me) return <><h2>{board.name}</h2><p>Open a plan link and tap I&apos;m in to see your plans here</p></>;
  const today = todayIn(board.tz), end = new Date(Date.parse(`${today}T00:00:00Z`) + 6 * 86400e3).toISOString().slice(0, 10);
  const formed = plans.filter(c => c.me === "in" && c.state === "formed" && (!c.day || c.day <= end)).sort((a, b) => (a.day ?? "9999").localeCompare(b.day ?? "9999"));
  const open = plans.filter(c => c.me === "in" && c.state === "open");
  const posted = plans.filter(c => c.posterId === me.id && (c.state === "open" || c.state === "didnt_form"));
  return <><div className="tag">Your week · {today}</div><h2>Your week</h2><p className="sub">{formed.length} crews · {open.length} forming · {posted.length} you posted</p>
    {formed.length ? <><div className="sec">This week</div>{formed.map(c => <PlanRow key={c.id} plan={c} status="You said yes" />)}</> : null}
    {open.length ? <><div className="sec">Forming</div>{open.map(c => <PlanRow key={c.id} plan={c} />)}</> : null}
    {posted.length ? <><div className="sec">You posted</div>{posted.map(c => <PlanRow key={c.id} plan={c} status={c.state === "open" && c.deadline ? `${Math.max(0, Math.round((Date.parse(c.deadline) - Date.parse(today)) / 86400e3))} days left, then it closes` : undefined} />)}</> : null}
    <OptIn boardId={board.id} label={board.steward_label ?? "the space steward"} share={share} /><ShowNameSwitch show={me.show_name} />
  </>;
}
