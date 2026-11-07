import 'server-only';
import type { Db, Q } from '../db';
import { isUuid } from '../load';
import { hashToken, magicToken } from '../tokens';
import { canAccessPersonal, type Principal } from './access';
import { audit } from './consent';

export type InvitationInput = { orgId: string; loopId: string; recipientEmail: string; role: 'owner' | 'organizer' | 'member' | 'follower'; expiresAt: string };
type Invitation = { id: string; org_id: string; loop_id: string; issued_by: string; recipient_email: string; role: InvitationInput['role']; expires_at: string; revoked_at: string | null; accepted_at: string | null };
const roles = ['follower', 'member', 'organizer', 'owner'];
const columns = 'id,org_id,loop_id,issued_by,recipient_email,role,expires_at,revoked_at,accepted_at';

function denied(): never { throw new Error('Invitation unavailable'); }

async function firstParty(q: Q, principal: Principal | null): Promise<Principal> {
  if (!principal || principal.clientId !== null) denied();
  if (!await canAccessPersonal(q, principal, principal.personId)) denied();
  const { rows } = await q.query(
    'select 1 from emba_identity where issuer=$1 and subject=$2 and person_id=$3 and revoked_at is null for share',
    [principal.issuer, principal.subject, principal.personId],
  );
  if (!rows.length) denied();
  return principal;
}

// Lock both parties before invitation or authority rows. Discovery is unlocked;
// the caller re-reads the invitation under lock before applying any mutation.
async function lockParties(q:Q,principal:Principal|null,issuerId:string) {
  if(!principal||principal.clientId!==null)denied();
  for(const id of [...new Set([principal.personId,issuerId])].sort()) {
    const {rows}=await q.query('select id from person where id=$1 for update',[id]);
    if(!rows.length)denied();
  }
}

// Lock the current grant, membership, identity and ancestry until the mutation
// commits, so removal/demotion has a serial order with invitation acceptance.
async function authority(q: Q, personId: string, orgId: string, loopId: string, role?: string): Promise<void> {
  if (!isUuid(orgId) || !isUuid(loopId)) denied();
  const allowed = role === 'owner' || role === 'organizer' ? ['owner'] : ['owner', 'organizer'];
  await q.query(
    `with recursive ancestors as (
       select id,parent_id from emba_loop where org_id=$1 and id=$2
       union all select l.id,l.parent_id from emba_loop l join ancestors a on l.id=a.parent_id where l.org_id=$1
     ) select l.id from emba_loop l join ancestors a on l.id=a.id for share of l`, [orgId, loopId],
  );
  const { rows } = await q.query(
    `with recursive ancestors as (
       select id,parent_id from emba_loop where org_id=$1 and id=$2
       union all select l.id,l.parent_id from emba_loop l join ancestors a on l.id=a.parent_id where l.org_id=$1
     )
     select r.role from ancestors a
     join emba_loop l on l.org_id=$1 and l.id=a.id
     join emba_role r on r.org_id=$1 and r.loop_id=a.id and r.person_id=$3 and r.revoked_at is null
     join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id and m.revoked_at is null
     join emba_identity i on i.person_id=r.person_id and i.revoked_at is null
     where r.role=any($4::text[]) for share of l,r,m,i`, [orgId, loopId, personId, allowed],
  );
  if (!rows.length) denied();
}

export async function issueInvitation(db: Db, principal: Principal | null, input: InvitationInput): Promise<{ id: string; token: string }> {
  if (!input || typeof input.recipientEmail !== 'string' || !roles.includes(input.role) ||
      typeof input.expiresAt !== 'string' || !Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.now()) denied();
  const email = input.recipientEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) denied();
  return db.tx(async q => {
    await q.query('set transaction isolation level serializable');
    const actor = await firstParty(q, principal);
    await authority(q, actor.personId, input.orgId, input.loopId, input.role);
    const token = magicToken();
    const { rows: [row] } = await q.query<{ id: string }>(
      `insert into emba_invitation (org_id,loop_id,issued_by,recipient_email,role,token_hash,expires_at)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [input.orgId, input.loopId, actor.personId, email, input.role, hashToken(token), input.expiresAt],
    );
    return { id: row.id, token };
  });
}
export async function listInvitations(db: Db, principal: Principal | null, orgId: string, loopId: string): Promise<Invitation[]> {
  return db.tx(async q => {
    await q.query('set transaction isolation level serializable');
    const actor = await firstParty(q, principal);
    await authority(q, actor.personId, orgId, loopId);
    const {rows}=await q.query<Invitation>(`select ${columns} from emba_invitation where org_id=$1 and loop_id=$2 order by created_at,id`, [orgId, loopId]);
    await audit(q,actor,'plan:read',loopId);
    return rows;
  });
}
export async function revokeInvitation(db: Db, principal: Principal | null, id: string): Promise<void> {
  if (!isUuid(id)) denied();
  await db.tx(async q => {
    await q.query('set transaction isolation level serializable');
    const {rows:[scope]}=await q.query<Invitation>(`select ${columns} from emba_invitation where id=$1`,[id]);
    if(!scope)denied();
    await lockParties(q,principal,scope.issued_by);
    const actor = await firstParty(q, principal);
    await authority(q, actor.personId, scope.org_id, scope.loop_id, scope.role);
    const { rows: [row] } = await q.query<Invitation>(`select ${columns} from emba_invitation where id=$1 for update`, [id]);
    if (!row || row.accepted_at || row.issued_by!==scope.issued_by || row.org_id!==scope.org_id || row.loop_id!==scope.loop_id || row.role!==scope.role) denied();
    await q.query('update emba_invitation set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=$1', [id]);
  });
}

/** Explicit first-party acceptance; a token or a legacy identity never enrolls a member on its own. */
export async function acceptInvitation(db: Db, principal: Principal | null, token: string): Promise<void> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(token)) denied();
  await db.tx(async q => {
    // Isolation must be selected before the discovery query. Any concurrent
    // change that invalidates this snapshot aborts the whole operation.
    await q.query('set transaction isolation level serializable');
    const {rows:[scope]}=await q.query<Invitation>(`select ${columns} from emba_invitation where token_hash=$1`,[hashToken(token)]);
    if(!scope)denied();
    await lockParties(q,principal,scope.issued_by);
    const actor = await firstParty(q, principal);
    if (!actor.verifiedEmail) denied();
    await authority(q, scope.issued_by, scope.org_id, scope.loop_id, scope.role);
    const { rows: [row] } = await q.query<Invitation>(
      `select ${columns} from emba_invitation where token_hash=$1 and revoked_at is null and accepted_at is null and expires_at>clock_timestamp() for update`,
      [hashToken(token)],
    );
    if (!row || row.recipient_email !== actor.verifiedEmail.trim().toLowerCase() || row.issued_by!==scope.issued_by || row.org_id!==scope.org_id || row.loop_id!==scope.loop_id || row.role!==scope.role) denied();
    await q.query('insert into emba_membership (org_id,person_id) values ($1,$2) on conflict do nothing', [row.org_id, actor.personId]);
    const { rows: [membership] } = await q.query<{ revoked_at: string | null }>(
      'select revoked_at from emba_membership where org_id=$1 and person_id=$2 for update', [row.org_id, actor.personId],
    );
    if (membership.revoked_at) {
      // Rejoining authorizes this invitation, not all roles held before removal.
      await q.query('update emba_role set revoked_at=coalesce(revoked_at,clock_timestamp()) where org_id=$1 and person_id=$2', [row.org_id, actor.personId]);
      await q.query('update emba_membership set revoked_at=null,joined_at=clock_timestamp() where org_id=$1 and person_id=$2', [row.org_id, actor.personId]);
    }
    await q.query(
      `insert into emba_role (org_id,loop_id,person_id,role) values ($1,$2,$3,$4)
       on conflict (org_id,loop_id,person_id) do update set revoked_at=null,
       role=case when emba_role.revoked_at is null and array_position($5::text[],emba_role.role)>array_position($5::text[],excluded.role)
         then emba_role.role else excluded.role end`, [row.org_id, row.loop_id, actor.personId, row.role, roles],
    );
    const accepted = await q.query(
      `update emba_invitation set accepted_at=clock_timestamp(),accepted_by=$2
       where id=$1 and accepted_at is null and revoked_at is null and expires_at>clock_timestamp() returning id`, [row.id, actor.personId],
    );
    if (!accepted.rows.length) denied();
  });
}
