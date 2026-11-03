import Link from "next/link";
import type { ReactNode } from "react";
import type { Board } from "@/lib/types";
import type { PlanModel } from "@/lib/view";
import { solar } from "@/lib/solar";
import { solarStyle } from "@/lib/solarStyle";
import { Sky } from "./Sky";
import { ToastProvider } from "./Toast";
export function Shell({ board, tab, plan, children }: { board: Board; tab: "board" | "new" | "you" | null; plan?: PlanModel; children: ReactNode }) {
  const ended = plan?.state === "didnt_form" || plan?.state === "closed";
  const classes = ['app', plan && 'sun', plan && 'w-' + plan.sky, plan && solar(plan.hour, plan.sky).dark && !ended && 'night', ended && 'dnf', plan?.state === 'formed' && plan.me === 'in' && 'formed'].filter(Boolean).join(' ');
  return <ToastProvider><div className={classes} style={plan ? solarStyle(plan.hour, plan.sky, ended) : undefined}>
    {plan && !ended ? <Sky sky={plan.sky} /> : null}
    <header className="head"><Link className="wm" href={'/b/' + board.slug}>Loop</Link><Link className="space" href={'/b/' + board.slug + (tab === 'board' ? '/you' : '')}>{tab === "board" ? "Your plans" : board.name}</Link></header>
    <main className={'screen' + (tab === 'you' || plan?.state === 'past' ? ' nobar' : '')}>{children}</main>
  </div></ToastProvider>;
}
