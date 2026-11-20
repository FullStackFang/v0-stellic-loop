import Link from 'next/link';
import { db } from '@/lib/db';
import { getPortalPrincipal, portalGroupTree } from '@/lib/emba/portal-session';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { authConfig } from '@/lib/emba/auth-token';
import { listLeases, listRemovedGroupGrants } from '@/lib/emba/consent';
import { assistantName } from '@/lib/emba/team-text';
import { noteConnectView } from '@/lib/emba/pilot-metrics';
import { hasAssistants } from '@/lib/campus/ink';
import { ActionForm } from '@/components/emba/portal-forms';
import { CopyText } from '@/components/emba/copy-link';
import { dayNum, mon } from '@/lib/days';
import { Via } from '../glyphs';
import { disconnectAssistant, grantGroupRead, renewGroupRead, revokeGroupRead, subscribeForAssistants } from '../connection-actions';

export const dynamic = 'force-dynamic';
// Calendar days are UTC: no team timezone is loaded on this page.
const utcDay = (at: unknown) => new Date(at as string | Date).toISOString().slice(0, 10);
const dayLabel = (at: unknown) => `${mon(utcDay(at))} ${dayNum(utcDay(at))}`;
const names = new Intl.ListFormat('en', { type: 'conjunction' });
const claudeId ='https://claude.ai/oauth/mcp-oauth-client-metadata';
const museId = 'oJLiBHFWfm5De8eq';
export default async function ConnectionsPage({ searchParams }: { searchParams?: Promise<{ assistant?: string | string[] }> } = {}) {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Assistant connections</h1><p>Sign in to manage your own group grants.</p><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent('/groups/connections')}`}>Sign in</Link></section>;
  // Counted once per member, for the operator's connecting funnel.
  await noteConnectView(db(), principal);
  // Assistants are part of Ink+. Nothing is charged yet: pressing Subscribe is kept (when, and that it was here) and opens the page.
  if (!await hasAssistants(db(), principal)) return <>
    <h1>Connect your assistant</h1>
    <section className="lt-editor"><h2>Assistants come with Ink+</h2><p>Your own AI, answering from your groups: what was decided, who has what, and what is due. Ink+ is $9.99 a month.</p>
      <ActionForm action={subscribeForAssistants} label="Subscribe"><label>Email to subscribe with<input type="email" name="email" required autoComplete="email" defaultValue={principal.verifiedEmail ?? ''}/></label></ActionForm></section>
  </>;
  let config: ReturnType<typeof authConfig> | null = null;
  try { config = authConfig(); } catch { /* Explain missing configuration below. */ }
  const ready = clerkPortalConfigured() && !!config && new URL(config.audience).pathname === '/api/mcp';
  // The groups come from the listing the side menu already made for this page view.
  let groups, leases, removed, clock;
  try { [groups, leases, removed, { rows: [clock] }] = await Promise.all([portalGroupTree(principal), listLeases(db(), principal), listRemovedGroupGrants(db(), principal), db().query<{ now: string }>('select current_timestamp as now')]); }
  catch { return <section className="lt-editor"><h1>Connections unavailable</h1><p role="alert">Your membership or session may have changed.</p></section>; }
  const access = (lease: Record<string, unknown>) => [...(lease.actions as string[])].sort().join(' ');
  // A grant for a group this person can no longer open reaches nothing, so it is not listed.
  const groupLeases = leases.flatMap(lease => { const group = groups.find(item => item.orgId === lease.org_id && item.loopId === lease.loop_id); return group && ['plan:read', 'group-memory:write plan:read'].includes(access(lease)) ? [{ lease, group }] : []; });
  // The names of the groups under a group, which a grant on it covers too.
  const inside = (loopId: string): string[] => groups.filter(item => item.parentLoopId === loopId).flatMap(item => [item.orgName, ...inside(item.loopId)]);
  const runs = groups.some(group => group.canStart);
  const teamUrl = config ? new URL('/api/mcp/team', config.audience).href : '';
  // A link from an assistant with no grant yet names that assistant, so the form opens with it chosen.
  const asked = (await searchParams)?.assistant;
  const chosen = typeof asked === 'string' && config?.clientIds.includes(asked) ? asked : undefined;
  // Muse has no identity of its own, so it is told Loopd's address and the one Loopd registered for it in a single line.
  const museLine = `Connect to Loopd at ${teamUrl} with client ID ${museId}`;
  const museOpen = groupLeases.some(({ lease }) => lease.client_id === museId && !lease.revoked_at);
  return <>
    <h1>Connect your assistant</h1><p>Connect Loopd once in your assistant, then give it access to a group. That covers the groups inside it too. Joining another top-level group does not add it to existing grants.</p>
    <section className="lt-editor"><h2>Connection readiness</h2>{ready ? <><p>Loopd has an HTTPS MCP endpoint and sign-in configuration. A successful host connection still needs to be tested with your account.</p><label>Team tools URL (brief, decisions, outputs, claims)<input readOnly value={teamUrl}/></label><label>MCP server URL (earlier tools)<input readOnly value={config!.audience}/></label></> : <p role="status">This deployment is not ready for assistant sign-in. It needs Clerk browser identity, OAuth issuer/JWKS, an HTTPS <code>/api/mcp</code> audience, and allowed client IDs. Your groups remain accessible through this website.</p>}
      <h3>Claude</h3><p>In Claude, open Customize → Connectors → Add → Custom → Web. Enter the Team tools URL above, choose sign-in and Claude’s published OAuth identity, then connect your account. The provider must admit Claude’s client ID and advertise <code>plan:read</code>, and <code>group-memory:write</code> if anyone will grant write access. See <a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">Claude’s setup guide</a>.</p>{!config?.clientIds.includes(claudeId) && <p role="status">Claude’s client ID is not admitted in this deployment.</p>}
      {ready && config!.clientIds.includes(museId) && <><h3>Muse</h3><p>Give Muse access to a team below first. Then paste this line to Muse, press Connect and sign in.</p><label>Line to paste into Muse<input readOnly value={museLine}/></label><CopyText text={museLine} label="Copy line"/>
        {museOpen && <ActionForm action={disconnectAssistant} label="Disconnect Muse"><input type="hidden" name="clientId" value={museId}/></ActionForm>}</>}
      <h3>ChatGPT</h3><p>Custom MCP connection availability depends on your ChatGPT plan and workspace permissions. The ChatGPT connection has not been verified for this pilot. See <a href="https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt">OpenAI’s current instructions</a>.</p>
    </section>
    <section className="lp-grants"><div className="lp-grants-head"><h2>Team grants</h2><p>Each grant lets one assistant reach one team, and the groups inside it, for 30 days.</p></div>
      {removed.length > 0 && <div className="lp-grants-ended" role="status">{removed.map(item => <p key={`${item.group} ${String(item.removedAt)}`}><b>{item.group}</b> was removed on {dayLabel(item.removedAt)}. {names.format(item.clientIds.map(assistantName))} can no longer reach it.</p>)}</div>}
      {groupLeases.length ? <ul>{groupLeases.map(({ lease, group }) => { const revoked = !!lease.revoked_at; const active = !revoked && Date.parse(String(lease.expires_at)) > Date.parse(clock.now); const left = (Date.parse(utcDay(lease.expires_at)) - Date.parse(utcDay(clock.now))) / 86400000;
        return <li key={String(lease.id)} className="lp-grant">
          <div className="lp-grant-team"><b>{group.orgName}</b><span>{group.handle}</span>{!revoked && active && inside(group.loopId).length > 0 && <small>Covers {names.format(inside(group.loopId))}</small>}</div>
          <Via clientId={String(lease.client_id)} verb=""/>
          <span className="lp-chip">{access(lease) === 'plan:read' ? 'Read' : 'Read and write'}</span>
          <span className="lp-when">{revoked ? <><span className="lp-chip lp-chip-off">Revoked</span><small>{dayLabel(lease.revoked_at)}</small></> : active ? <><span>Ends {dayLabel(lease.expires_at)}</span><small className={left <= 7 ? 'lp-soon' : undefined}>{left === 0 ? 'Ends today' : `${left} ${left === 1 ? 'day' : 'days'} left`}</small></> : <><span className="lp-chip lp-chip-bad">Expired</span><small>{dayLabel(lease.expires_at)}</small></>}</span>
          <span className="lp-acts">{!revoked && <>{config?.clientIds.includes(String(lease.client_id)) && <ActionForm action={renewGroupRead} label="Renew for 30 days"><input type="hidden" name="id" value={String(lease.id)}/></ActionForm>}<ActionForm action={revokeGroupRead} label="Revoke"><input type="hidden" name="id" value={String(lease.id)}/></ActionForm></>}</span>
        </li>; })}</ul> : <p className="lp-grants-none">No assistant can reach your teams yet. Give one access below.</p>}
      {ready && groups.length > 0 && <div className="lp-give"><h3>Give an assistant access</h3>
        <ActionForm action={grantGroupRead} label="Grant 30-day access"><label>Assistant<select name="clientId" defaultValue={chosen}>{config!.clientIds.map(id => <option key={id} value={id}>{assistantName(id)}</option>)}</select></label><label>Team<select name="scope" required>{groups.map(group => <option key={group.loopId} value={`${group.orgId}:${group.loopId}`}>{group.orgName}</option>)}</select></label>
          <div className="lp-seg" role="radiogroup" aria-label="Access"><span aria-hidden="true">Access</span><div><label><input type="radio" name="access" value="read" defaultChecked/>Read</label><label><input type="radio" name="access" value="write"/>Read and write</label></div></div>
          <p className="lp-give-note">Access to a team covers every group inside it, including ones added later.</p>
          <p className="lp-give-hint"><span>It can see the team&apos;s records. It cannot save anything.</span><span>It can also save, correct and withdraw records under your name when you ask.</span></p></ActionForm></div>}
      <div className="lp-grants-more"><details><summary>What each level allows</summary><div className="lp-allow">
        <div><h3>Read <small>lets it see</small></h3><ul>{['The brief and announcements', 'Decisions, outputs and claims', 'The team’s links and texts, with their tags', 'Teammates’ handles'].map(item => <li key={item}>{item}</li>)}</ul></div>
        <div><h3>Read and write <small>also lets it, under your name</small></h3><ul>{['Save decisions, outputs and claims', 'Save links and texts to Resources, and tag ones that have none', 'Correct or withdraw what you saved', 'Confirm, decline, finish or release your claims', 'Replace a teammate’s output with a newer one', 'Tag teammates', ...(runs ? ['In a team you run: start, rename and archive groups inside it', 'In a team you run: invite people by email, as members'] : [])].map(item => <li key={item}>{item}</li>)}</ul></div>
        <p>It writes only when you ask, with no further approval step. Everything it saves is listed on the team page, where you can withdraw it. Each grant covers one assistant and one team, with the groups inside it, for 30 days; granting again replaces the earlier one. Revoking blocks later use, but cannot recall text already delivered in an outside chat.</p></div></details></div>
    </section>
  </>;
}
