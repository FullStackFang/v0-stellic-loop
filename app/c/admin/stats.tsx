import Link from 'next/link';
import type { ReactNode } from 'react';
import { db } from '@/lib/db';
import { accounts, lastDays, personFacts, siteActions, siteOpens, summarise, WAYS, type Way } from '@/lib/campus/stats';
import { localParts } from '@/lib/campus/time';
import './stats.css';

// The admin's Activity and People sections (public/demo/mockups-admin-stats.html). Both are about the whole site, not
// one campus: the campus only sets the timezone a day is counted in.

export const SPANS = { '7': '7 days', '30': '30 days', all: 'All time' } as const;
export type Span = keyof typeof SPANS;
const DAY = 86_400_000;
type Top = (beside?: ReactNode) => ReactNode;
const count = (n: number) => n.toLocaleString('en-US');
const weekend = (day: string) => [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
const short = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** One line a thing, the most first: its name, a bar against the most, the count. */
function Rank({ rows, none }: { rows: { name: string; n: number }[]; none: string }) {
  const most = Math.max(1, ...rows.map(row => row.n));
  if (!rows.length) return <p className="cs-st-none">{none}</p>;
  return <ul className="cs-st-rank">{rows.map(row => <li key={row.name}>{row.name}<span className="bar" aria-hidden="true"><i style={{ width: `${row.n / most * 100}%` }} /></span><b>{count(row.n)}</b></li>)}</ul>;
}

/** How busy the site is over 7 days, 30 days or all time. `href` is the address of this section for another span. */
export async function Activity({ tz, span, href, top, now = new Date() }: { tz: string; span: Span; href: (span: Span) => string; top: Top; now?: Date }) {
  const since = span === 'all' ? null : new Date(now.getTime() - Number(span) * DAY), today = localParts(tz, now).date;
  const [all, opens, did] = await Promise.all([accounts(), siteOpens(db(), since, tz), siteActions(db(), since)]);
  const sum = summarise(all, since), yesterday = lastDays(today, 2)[0];
  // All time is drawn as the days since counting began, the last 90 at most.
  const days = span === 'all' ? lastDays(today, 90).filter(day => day === today || (opens.since !== null && day >= opens.since)) : lastDays(today, Number(span));
  const peak = Math.max(1, ...days.map(day => opens.days.get(day)?.people ?? 0)), here = (day: string) => opens.days.get(day)?.people ?? 0;
  return <section className="cs-st">
    {top(<nav className="cs-st-sw" aria-label="Time">{(Object.keys(SPANS) as Span[]).map(each => <Link key={each} href={href(each)} aria-current={each === span ? 'true' : undefined}>{SPANS[each]}</Link>)}</nav>)}
    <div className="cs-st-grid four">
      <div className="cs-st-pn num lead"><h2>People signed up</h2><b>{count(sum.people)}</b><span>{span === 'all' ? 'since the start' : <><i>+{count(sum.joined)}</i>new in this time</>}</span></div>
      <div className="cs-st-pn num"><h2>On the site today</h2><b>{count(here(today))}</b><span><i>{count(here(yesterday))}</i>yesterday</span></div>
      <div className="cs-st-pn num"><h2>Active{span === 'all' ? ', ever' : ', this time'}</h2><b>{count(sum.active)}</b><span><i>{sum.people ? Math.round(sum.active / sum.people * 100) : 0}%</i>of everyone</span></div>
      <div className="cs-st-pn num"><h2>Pages opened</h2><b>{count(opens.total)}</b><span><i>{count(opens.people)}</i>people signed in</span></div>
    </div>
    <div className="cs-st-grid wide">
      <div className="cs-st-pn"><h2>People on the site, by day<em>{span === 'all' ? `last ${days.length} ${days.length === 1 ? 'day' : 'days'}` : `last ${SPANS[span]}`}</em></h2>
        {opens.since ? <>
          <div className="cs-st-days" role="img" aria-label={`People on the site each day, ${short(days[0])} to today. The most in a day: ${peak}.`}>{days.map(day => <i key={day} className={day === today ? 'now' : weekend(day) ? 'we' : undefined} title={`${short(day)}: ${here(day)} ${here(day) === 1 ? 'person' : 'people'}, ${count(opens.days.get(day)?.opens ?? 0)} pages`} style={{ height: `${Math.max(here(day) / peak * 100, 1.5)}%` }} />)}</div>
          <div className="cs-st-axis"><span>{short(days[0])}</span><span>most in a day <b>{peak}</b> · counted since <b>{short(opens.since)}</b></span><span>today</span></div>
        </> : <p className="cs-st-none">Nothing counted yet. Pages opened are counted from the day the live site starts counting them.</p>}
      </div>
      <div className="cs-st-pn"><h2>How they can sign in</h2>
        {sum.ways.length ? <><div className="cs-st-split" aria-hidden="true">{sum.ways.map(each => <i key={each.way} className={each.way} style={{ flex: each.people }} />)}</div>
          <ul className="cs-st-ways">{sum.ways.map(each => <li key={each.way}><u className={each.way} />{WAYS[each.way]}<b>{count(each.people)}</b><small>{Math.round(each.people / sum.people * 100)}%</small></li>)}</ul></>
          : <p className="cs-st-none">No accounts yet.</p>}
      </div>
    </div>
    <div className="cs-st-grid two">
      <div className="cs-st-pn"><h2>Where people go<em>pages opened</em></h2><Rank rows={opens.areas.map(each => ({ name: each.area, n: each.opens }))} none="Nothing counted yet." /></div>
      <div className="cs-st-pn"><h2>What people do<em>times</em></h2><Rank rows={did.map(each => ({ name: each.name, n: each.times }))} none="Nothing yet." /></div>
    </div>
  </section>;
}

const ago = (at: number | null, now: number) => {
  if (!at) return 'Never';
  const minutes = Math.max(0, Math.floor((now - at) / 60_000)), days = Math.floor(minutes / 1440);
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} hr ago` : days === 1 ? 'Yesterday' : `${days} days ago`;
};

/** Every account, the most recently signed in first. `way` shows only those who can sign in that way; `shown` is how many lines. */
export async function People({ tz, way, shown, href, top, now = new Date() }: { tz: string; way: Way | null; shown: number; href: (way: Way | null, shown?: number) => string; top: Top; now?: Date }) {
  const all = await accounts(), sum = summarise(all, null), listed = way ? all.filter(each => each.ways.includes(way)) : all, rows = listed.slice(0, shown);
  const fortnight = lastDays(localParts(tz, now).date, 14), facts = await personFacts(db(), rows.map(each => each.subject), tz, new Date(now.getTime() - 15 * DAY));
  const joined = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz });
  /* eslint-disable @next/next/no-img-element -- animals from public/animals, pictures Loopd made, and the photo of a sign-in account */
  return <section className="cs-st">
    {top(<nav className="cs-st-sw" aria-label="Signs in with"><Link href={href(null)} aria-current={way ? undefined : 'true'}>Everyone<small>{count(sum.people)}</small></Link>{sum.ways.map(each => <Link key={each.way} href={href(each.way)} aria-current={each.way === way ? 'true' : undefined}>{WAYS[each.way]}<small>{count(each.people)}</small></Link>)}</nav>)}
    <div className="cs-st-pn"><h2>Most recently signed in<em>showing {count(rows.length)} of {count(listed.length)}</em></h2>
      {rows.length ? <table className="cs-adm-table cs-st-people"><thead><tr><th>Person</th><th>School</th><th>Can sign in with</th><th>Joined</th><th>Last 14 days</th><th>Last signed in</th><th>Plan</th></tr></thead>
        <tbody>{rows.map(each => { const known = facts.get(each.subject), on = fortnight.map(day => !!known?.days.includes(day)), n = on.filter(Boolean).length; return <tr key={each.subject}>
          <td><span className="who"><img src={known?.face ?? each.photo} alt="" /><span><b>{each.name || 'No name'}</b><small>{each.email ?? 'No email'}</small></span></span></td>
          <td>{known ? known.school ?? 'No school yet' : 'Not seen yet'}</td>
          <td>{each.ways.map(one => <span key={one} className="way"><u className={one} />{WAYS[one]}</span>)}</td>
          <td>{joined(each.joined)}</td>
          <td><span className="spark" aria-hidden="true">{on.map((was, at) => <i key={at} className={was ? undefined : 'z'} />)}</span>{n} {n === 1 ? 'day' : 'days'}</td>
          <td>{ago(each.lastSignIn, now.getTime())}</td>
          <td>{known?.inkPlus ? <span className="plan plus">Ink+</span> : known?.ink ? <span className="plan">Ink</span> : null}</td></tr>; })}</tbody></table>
        : <p className="cs-st-none">{all.length ? 'Nobody signs in this way.' : 'No accounts yet.'}</p>}
      {listed.length > rows.length && <p className="cs-st-more"><Link className="cs-btn sm" href={href(way, shown + 50)}>Show 50 more</Link></p>}
    </div>
  </section>;
  /* eslint-enable @next/next/no-img-element */
}
