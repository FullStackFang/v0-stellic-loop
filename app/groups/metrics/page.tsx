import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { isOperator, pilotMetrics, ROUTES } from '@/lib/emba/pilot-metrics';

export const dynamic = 'force-dynamic';
const routeWords = { site: 'Site', share_link: 'Share link', personal_link: 'Personal link', assistant: 'Assistant, in text', assistant_card: 'Assistant, card tap', whatsapp: 'WhatsApp button' } as const;

// The operator's page. Anyone else, an organizer included, is told there is no such page.
export default async function MetricsPage() {
  const principal = await getPortalPrincipal();
  if (!isOperator(principal)) notFound();
  const m = await pilotMetrics(db(), principal);
  return <>
    <h1>Pilot numbers</h1><p>The last {m.days} days. Every number counts members or sessions; none is about one member, and a row that would count fewer than 3 members is left out. <Link href="/groups/metrics/export" prefetch={false}>Download the per-group numbers as CSV</Link>.</p>
    <section className="lt-editor"><h2>Do assistants check Loop first?</h2>
      <p className="emba-meta">A session is one connection an assistant opened. Conversations in which the assistant never contacted Loop cannot be seen here, and an assistant may reuse one session for several conversations.</p>
      {m.hosts.length ? <table><thead><tr><th scope="col">Assistant</th><th scope="col">Members connected</th><th scope="col">Sessions</th><th scope="col">Checked what is waiting first</th><th scope="col">Called something else first</th><th scope="col">Called nothing</th><th scope="col">Answers and interest by card tap</th><th scope="col">By the model in text</th></tr></thead>
        <tbody>{m.hosts.map(row => <tr key={row.host}><th scope="row">{row.host}</th><td>{row.members}</td><td>{row.sessions}</td><td>{row.waitingFirst}</td><td>{row.otherFirst}</td><td>{row.noCall}</td><td>{row.byCard}</td><td>{row.byModel}</td></tr>)}</tbody></table> : <p className="lp-empty">No assistant has connected in this period.</p>}</section>
    <section className="lt-editor"><h2>Connecting, step by step</h2><p className="emba-meta">Members who reached each step, since the start.</p>
      <p>{m.funnel.joined} joined a group · {m.funnel.openedConnectPage} opened the connect page</p>
      {m.funnel.hosts.length > 0 && <table><thead><tr><th scope="col">Assistant</th><th scope="col">Signed in from it</th><th scope="col">Granted it a group</th><th scope="col">Made a first call</th></tr></thead>
        <tbody>{m.funnel.hosts.map(row => <tr key={row.host}><th scope="row">{row.host}</th><td>{row.signedIn}</td><td>{row.granted}</td><td>{row.called}</td></tr>)}</tbody></table>}</section>
    <section className="lt-editor"><h2>Answers within 48 hours, by how they arrived</h2><p className="emba-meta">Per group and week of asking. Expected is the members who can answer now, times the asks.</p>
      {m.groups.length ? <table><thead><tr><th scope="col">Group</th><th scope="col">Week of</th><th scope="col">Asks</th><th scope="col">Expected answers</th>{ROUTES.map(route => <th key={route} scope="col">{routeWords[route]}</th>)}<th scope="col">Median hours to close</th></tr></thead>
        <tbody>{m.groups.map(row => <tr key={`${row.group} ${row.week}`}><th scope="row">{row.group}</th><td>{row.week}</td><td>{row.asks}</td><td>{row.expected}</td>{ROUTES.map(route => <td key={route}>{row.within48[route]}{row.expected > 0 && row.within48[route] > 0 ? ` (${Math.round(100 * row.within48[route] / row.expected)}%)` : ''}</td>)}<td>{row.medianHoursToClose ?? ''}</td></tr>)}</tbody></table> : <p className="lp-empty">No asks in this period.</p>}</section>
  </>;
}
