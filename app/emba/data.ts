import 'server-only';
import { db } from '@/lib/db';
import type { Principal } from '@/lib/emba/access';
import { canAccessLoop } from '@/lib/emba/access';
import { audit, listLeases, readAudit, requireFirstParty } from '@/lib/emba/consent';
import type { MemoryItem } from '@/lib/emba/memory';
import { listInvitations } from '@/lib/emba/invitations';

export async function readPortalData(principal: Principal) {
  // Self-service includes archived/review-needed records so members can correct
  // them. The ordinary planning service deliberately excludes those records.
  const memory = await readScopedMemory(principal, null, null);
  const leases = await listLeases(db(),principal);
  const events = await readAudit(db(),principal);
  return { memory, leases, events, loadedAt: Date.now() };
}

export async function readScopedMemory(principal: Principal, orgId: string | null, loopId: string | null) {
  if ((orgId === null) !== (loopId === null)) throw new Error('Invalid memory scope');
  return db().tx(async q => {
    await requireFirstParty(q,principal);
    if (orgId && loopId && !await canAccessLoop(q,principal,orgId,loopId,'read')) throw new Error('Memory unavailable');
    const { rows } = await q.query<MemoryItem>(`select m.id,m.kind,v.version,v.text,v.category,v.place,v.strength,v.confidence,v.evidence_count as "evidenceCount",v.status,v.starts_at as "startsAt",v.ends_at as "endsAt",v.confirmed_at as "confirmedAt"
      from emba_memory m join emba_memory_version v on v.person_id=m.person_id and v.memory_id=m.id and v.version=m.current_version
      where m.person_id=$1 and m.org_id is not distinct from $2::uuid and m.loop_id is not distinct from $3::uuid order by v.confirmed_at desc,m.id limit 101`,[principal.personId,orgId,loopId]);
    await requireFirstParty(q,principal);
    if (orgId && loopId && !await canAccessLoop(q,principal,orgId,loopId,'read')) throw new Error('Memory unavailable');
    await audit(q,principal,'memory:read');
    return { items:rows.slice(0,100),truncated:rows.length>100 };
  });
}

export async function readOrganizerInvitations(principal: Principal, orgId: string, loopId: string) {
  if (!await canAccessLoop(db(),principal,orgId,loopId,'manage')) return null;
  return listInvitations(db(),principal,orgId,loopId);
}
