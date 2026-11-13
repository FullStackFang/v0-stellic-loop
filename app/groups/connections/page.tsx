import Link from 'next/link';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { authConfig } from '@/lib/emba/auth-token';
import { listPortalGroups } from '@/lib/emba/groups';
import { listLeases } from '@/lib/emba/consent';
import { assistantName } from '@/lib/emba/team-text';
import { ActionForm } from '@/components/emba/portal-forms';
import { grantGroupRead, renewGroupRead, revokeGroupRead } from '../connection-actions';

export const dynamic = 'force-dynamic';
const claudeId = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
export default async function ConnectionsPage() {
  const principal = await getPortalPrincipal();
  if (!principal) return <section className="lt-editor"><h1>Assistant connections</h1><p>Sign in to manage your own group grants.</p><Link href={`/groups/sign-in?redirect_url=${encodeURIComponent('/groups/connections')}`}>Sign in</Link></section>;
  let config: ReturnType<typeof authConfig> | null = null;
  try { config = authConfig(); } catch { /* Explain missing configuration below. */ }
  const ready = clerkPortalConfigured() && !!config && new URL(config.audience).pathname === '/api/mcp';
  let groups, leases, clock;
  try { [groups, leases, { rows: [clock] }] = await Promise.all([listPortalGroups(db(), principal), listLeases(db(), principal), db().query<{ now: string }>('select current_timestamp as now')]); }
  catch { return <section className="lt-editor"><h1>Connections unavailable</h1><p role="alert">Your membership or session may have changed.</p></section>; }
  const access = (lease: Record<string, unknown>) => [...(lease.actions as string[])].sort().join(' ');
  const groupLeases = leases.filter(lease => lease.org_id && lease.loop_id && ['plan:read', 'group-memory:write plan:read'].includes(access(lease)));
  const teamUrl = config ? new URL('/api/mcp/team', config.audience).href : '';
  return <>
    <h1>Connect your assistant</h1><p>Connect Loop once in your assistant, then grant that client read access to each group you choose. Joining another group does not add it to existing grants.</p>
    <section className="lt-editor"><h2>Connection readiness</h2>{ready ? <><p>Loop has an HTTPS MCP endpoint and sign-in configuration. A successful host connection still needs to be tested with your account.</p><label>Team tools URL (brief, decisions, outputs, claims)<input readOnly value={teamUrl}/></label><label>MCP server URL (earlier tools)<input readOnly value={config!.audience}/></label></> : <p role="status">This deployment is not ready for assistant sign-in. It needs Clerk browser identity, OAuth issuer/JWKS, an HTTPS <code>/api/mcp</code> audience, and allowed client IDs. Your groups remain accessible through this website.</p>}
      <h3>Claude</h3><p>In Claude, open Customize → Connectors → Add → Custom → Web. Enter the Team tools URL above, choose sign-in and Claude’s published OAuth identity, then connect your account. The provider must admit Claude’s client ID and advertise <code>plan:read</code>, and <code>group-memory:write</code> if anyone will grant write access. See <a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">Claude’s setup guide</a>.</p>{!config?.clientIds.includes(claudeId) && <p role="status">Claude’s client ID is not admitted in this deployment.</p>}
      <h3>ChatGPT</h3><p>Custom MCP connection availability depends on your ChatGPT plan and workspace permissions. The ChatGPT connection has not been verified for this pilot. See <a href="https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt">OpenAI’s current instructions</a>.</p>
    </section>
    <section className="lt-editor"><h2>Team grants</h2><p>Each grant is for one assistant and one team, and lasts 30 days. Renew before expiry or revoke it at any time. Revocation blocks later use, but cannot recall text already delivered in an external chat.</p><p><strong>Read</strong> lets the assistant see the team&apos;s brief, announcements, decisions, outputs and claims, the text of its uploaded resources, and teammates&apos; handles. <strong>Read and write</strong> also lets it save decisions, outputs and claims under your name when you ask it to, with no further approval step. With write it can also correct or withdraw what you saved, confirm, decline, finish or release your claims, replace a teammate&apos;s output with a newer one, and tag teammates. Everything it saves is listed on the team page, where you can withdraw it. Granting again for the same assistant and team replaces the earlier grant.</p>
      {groupLeases.length ? <ul>{groupLeases.map(lease => { const group = groups.find(item => item.orgId === lease.org_id && item.loopId === lease.loop_id); const active = !lease.revoked_at && Date.parse(String(lease.expires_at)) > Date.parse(clock.now); return <li key={String(lease.id)}>{group ? group.orgName : 'Group no longer available'} · {assistantName(String(lease.client_id))} · {access(lease) === 'plan:read' ? 'Read' : 'Read and write'} · {lease.revoked_at ? 'Revoked' : active ? 'Active' : 'Expired'} · Expires {String(lease.expires_at)}{!lease.revoked_at && group && <>{config?.clientIds.includes(String(lease.client_id)) && <ActionForm action={renewGroupRead} label="Renew for 30 days"><input type="hidden" name="id" value={String(lease.id)}/></ActionForm>}<ActionForm action={revokeGroupRead} label="Revoke"><input type="hidden" name="id" value={String(lease.id)}/></ActionForm></>}</li>; })}</ul> : <p>No team grants yet.</p>}
      {ready && groups.length > 0 && <ActionForm action={grantGroupRead} label="Grant 30-day access"><label>Assistant client<select name="clientId">{config!.clientIds.map(id => <option key={id} value={id}>{assistantName(id)}</option>)}</select></label><label>Group<select name="scope" required>{groups.map(group => <option key={group.loopId} value={`${group.orgId}:${group.loopId}`}>{group.orgName}</option>)}</select></label><label>Access<select name="access" defaultValue="read"><option value="read">Read</option><option value="write">Read and write: the assistant can save, correct and withdraw records under my name when I ask</option></select></label></ActionForm>}
    </section>
  </>;
}
