import 'server-only';
import type { Q } from '../db';
import { isUuid } from '../load';

const authority = Symbol('verified principal');
export type Principal = Readonly<{ personId: string; issuer: string; subject: string; expiresAt: number; authenticatedAt: number | null; clientId: string | null; scopes: readonly string[]; verifiedEmail: string | null; [authority]: true }>;
// Only a trusted server adapter may supply this verifier. Never accept claims
// directly from HTTP/MCP arguments. Provider integration remains a separate gate.
export type IdentityVerifier = (credential: string) => Promise<{ issuer: string; subject: string; expiresAt: number; authenticatedAt?: number; clientId?: string; scopes?: readonly string[]; verifiedEmail?: string } | null>;
export type LoopAction = 'read' | 'post' | 'commit' | 'manage' | 'delegate_organizer';

export async function authenticate(q: Q, credential: string, verify: IdentityVerifier): Promise<Principal | null> {
  const identity = await verify(credential);
  if (!identity || !Number.isFinite(identity.expiresAt) || identity.expiresAt <= Date.now()) return null;
  const { rows: [row] } = await q.query<{ person_id: string }>(
    'select person_id from emba_identity i where issuer=$1 and subject=$2 and revoked_at is null and not exists(select 1 from emba_deletion_tombstone t where t.person_id=i.person_id)',
    [identity.issuer, identity.subject],
  );
  return row ? Object.freeze({ personId: row.person_id, issuer: identity.issuer, subject: identity.subject, expiresAt: identity.expiresAt, authenticatedAt: identity.authenticatedAt ?? null, clientId: identity.clientId ?? null, scopes: Object.freeze([...(identity.scopes ?? [])]), verifiedEmail: identity.verifiedEmail?.trim().toLowerCase() ?? null, [authority]: true as const }) : null;
}

function valid(principal: Principal | null): principal is Principal {
  return !!principal && principal[authority] === true && principal.expiresAt > Date.now();
}

// Current identity, not just the earlier authentication result, is checked on
// each access. These checks establish base authority; delegated output must also
// pass leases and audit in its service before it is exposed by an adapter.
export async function canAccessPersonal(q: Q, principal: Principal | null, personId: string): Promise<boolean> {
  if (!valid(principal) || principal.personId !== personId) return false;
  await q.query('select id from person where id=$1 for share',[personId]);
  const { rows } = await q.query(
    'select 1 from emba_identity i join person p on p.id=i.person_id where issuer=$1 and subject=$2 and person_id=$3 and revoked_at is null and not exists(select 1 from emba_deletion_tombstone t where t.person_id=i.person_id) for share of p,i',
    [principal.issuer, principal.subject, personId],
  );
  return rows.length > 0;
}

const allowedRoles: Record<LoopAction, string[]> = {
  read: ['owner','organizer','member','follower'],
  post: ['owner','organizer','member'],
  commit: ['owner','organizer','member'],
  manage: ['owner','organizer'],
  delegate_organizer: ['owner'],
};

export async function canAccessLoop(q: Q, principal: Principal | null, orgId: string, loopId: string, action: LoopAction): Promise<boolean> {
  if (!valid(principal) || !isUuid(orgId) || !isUuid(loopId) || !Object.hasOwn(allowedRoles, action)) return false;
  if (!await canAccessPersonal(q,principal,principal.personId)) return false;
  // Hold the hierarchy used to derive inherited authority until commit.
  await q.query(`with recursive ancestors as (
    select id,parent_id from emba_loop where org_id=$1 and id=$2 union all
    select l.id,l.parent_id from emba_loop l join ancestors a on l.id=a.parent_id where l.org_id=$1)
    select l.id from emba_loop l join ancestors a on a.id=l.id order by l.id for share of l`,[orgId,loopId]);
  const { rows } = await q.query(
    `with recursive ancestors as (
       select id, parent_id from emba_loop where org_id=$1 and id=$2
       union all
       select l.id, l.parent_id from emba_loop l join ancestors a on l.id=a.parent_id where l.org_id=$1
     )
     select 1 from ancestors a
     join emba_role r on r.org_id=$1 and r.loop_id=a.id and r.person_id=$3 and r.revoked_at is null
     join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id and m.revoked_at is null
     join emba_identity i on i.person_id=m.person_id and i.issuer=$4 and i.subject=$5 and i.revoked_at is null
     where r.role = any($6::text[]) and not exists(select 1 from emba_deletion_tombstone t where t.person_id=i.person_id) limit 1 for share of m,r,i`,
    [orgId, loopId, principal.personId, principal.issuer, principal.subject, allowedRoles[action]],
  );
  return rows.length > 0;
}
