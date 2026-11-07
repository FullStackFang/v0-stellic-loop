import 'server-only';
import { z } from 'zod';
import type { Db } from '../db';
import type { Principal } from './access';
import { audit, authorize, requireFirstParty, scopeShape } from './consent';
import { saveMemory } from './memory';

const candidateSchema = z.strictObject({
  id: z.uuid().optional(), expectedVersion: z.number().int().positive().optional(),
  kind: z.literal('want'), text: z.string().trim().min(1).max(240),
  category: z.enum(['food','culture','outdoors','social','rest','travel','learning','other']),
  place: z.string().trim().min(1).max(120).nullable(),
  strength: z.number().min(0).max(1), confidence: z.number().min(0).max(1),
  ...scopeShape,
}).refine(value => !!value.id === !!value.expectedVersion)
  .refine(value => (value.orgId === null) === (value.loopId === null));

export type MemoryCandidate = z.infer<typeof candidateSchema>;
export type CurrentWant = { version: number; text: string; category: string; place: string | null; strength: number; confidence: number; status: string };
export type MemoryReview = { outcome: 'new' | 'unchanged' | 'conflict' | 'stale' | 'scope_conflict'; candidate: MemoryCandidate; current: CurrentWant | null };

export function parseMemoryCandidate(input: unknown): MemoryCandidate { return candidateSchema.parse(input); }

/** A candidate stays in the request/response. Only the audit action is stored. */
export async function reviewMemoryCandidate(db: Db, principal: Principal, input: unknown): Promise<MemoryReview> {
  const candidate = parseMemoryCandidate(input);
  return db.tx(async q => {
    await requireFirstParty(q,principal);
    await authorize(q,principal,'memory:read',candidate);
    let outcome: MemoryReview['outcome'] = 'new';
    let current: CurrentWant | null = null;
    if (candidate.id) {
      const { rows: [row] } = await q.query<CurrentWant & { kind: string; org_id: string | null; loop_id: string | null }>(
        `select m.kind,m.org_id,m.loop_id,v.version,v.text,v.category,v.place,v.strength,v.confidence,v.status
         from emba_memory m join emba_memory_version v on v.person_id=m.person_id and v.memory_id=m.id and v.version=m.current_version
         where m.person_id=$1 and m.id=$2 for share of m,v`,
        [principal.personId,candidate.id],
      );
      if (!row) outcome = 'stale';
      else if (row.kind !== candidate.kind || row.org_id !== candidate.orgId || row.loop_id !== candidate.loopId) outcome = 'scope_conflict';
      else {
        current = {version:row.version,text:row.text,category:row.category,place:row.place,strength:row.strength,confidence:row.confidence,status:row.status};
        outcome = row.version !== candidate.expectedVersion ? 'stale'
          : row.status === 'active' && row.text === candidate.text && row.category === candidate.category && row.place === candidate.place && row.strength === candidate.strength && row.confidence === candidate.confidence ? 'unchanged' : 'conflict';
      }
    }
    await authorize(q,principal,'memory:read',candidate);
    await audit(q,principal,'memory:read',candidate.id ?? null);
    return {outcome,candidate,current};
  });
}

export async function acceptMemoryCandidate(db: Db, principal: Principal, input: unknown, operationId: string) {
  z.uuid().parse(operationId);
  const candidate = parseMemoryCandidate(input);
  // saveMemory checks an exact operation replay before its version check. A
  // successful correction can therefore be retried without reviving stale work.
  return saveMemory(db,principal,{...candidate,operationId,status:'active',startsAt:null,endsAt:null});
}
