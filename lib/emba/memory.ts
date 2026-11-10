import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db';
import type { Principal } from './access';
import { audit, authorize, requireFirstParty, scopeShape } from './consent';
import { EmbaError } from './errors';

export const memorySchema = z.strictObject({
  operationId: z.uuid(), id: z.uuid().optional(), expectedVersion: z.number().int().positive().optional(),
  kind: z.enum(['want','intent']), text: z.string().trim().min(1).max(240),
  category: z.enum(['food','culture','outdoors','social','rest','travel','learning','other']),
  place: z.string().trim().min(1).max(120).nullable().default(null),
  strength: z.number().min(0).max(1), confidence: z.number().min(0).max(1),
  status: z.enum(['active','needs_review','archived']).default('active'),
  startsAt: z.iso.datetime({offset:true}).nullable().default(null), endsAt: z.iso.datetime({offset:true}).nullable().default(null),
  ...scopeShape,
}).refine(v => (v.orgId === null) === (v.loopId === null))
  .refine(v => !!v.id === !!v.expectedVersion)
  .refine(v => v.kind === 'want' ? v.startsAt === null && v.endsAt === null : !!v.startsAt && !!v.endsAt && Date.parse(v.endsAt) > Date.parse(v.startsAt));
export const memoryQuerySchema = z.strictObject({
  ...scopeShape, place: z.string().trim().min(1).max(120).optional(), limit: z.number().int().min(1).max(100).default(30),
}).refine(v => (v.orgId === null) === (v.loopId === null));
export type MemoryItem = {id:string;kind:'want'|'intent';version:number;text:string;category:string;place:string|null;strength:number;confidence:number;evidenceCount:number;status:string;startsAt:string|null;endsAt:string|null;confirmedAt:string};

// Accepts member-reviewed structured preferences only. It is deliberately not a
// conversation compiler or a publication/commitment operation.
export async function saveMemory(db: Db, principal: Principal, input: unknown): Promise<{id:string;version:number}> {
  const data = memorySchema.parse(input);
  const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return db.tx(async q => {
    // Take the exclusive lock before authorization acquires shared identity locks.
    await q.query('select id from person where id=$1 for update',[principal.personId]);
    await requireFirstParty(q,principal);
    const leaseId = await authorize(q,principal,'memory:write',data);
    // Serialize one person's corrections and operation retries across replicas.
    const { rows: [previous] } = await q.query<{request_hash:string;memory_id:string;version:number}>(
      'select request_hash,memory_id,version from emba_memory_operation where person_id=$1 and operation_id=$2',[principal.personId,data.operationId]);
    if (previous) {
      if (previous.request_hash !== hash) throw new EmbaError('conflict');
      await audit(q,principal,'memory:write',previous.memory_id,leaseId);
      return {id:previous.memory_id,version:previous.version};
    }
    const id = data.id ?? randomUUID();
    const version = (data.expectedVersion ?? 0) + 1;
    if (data.id) {
      const { rows: [existing] } = await q.query<{current_version:number;kind:string;org_id:string|null;loop_id:string|null}>(
        'select current_version,kind,org_id,loop_id from emba_memory where person_id=$1 and id=$2 for update',[principal.personId,id]);
      if (!existing) throw new EmbaError('not_found');
      if (existing.current_version !== data.expectedVersion || existing.kind !== data.kind || existing.org_id !== data.orgId || existing.loop_id !== data.loopId) throw new EmbaError('conflict');
      await q.query("update emba_memory_version set status='superseded' where person_id=$1 and memory_id=$2 and version=$3",[principal.personId,id,data.expectedVersion]);
      await q.query('update emba_memory set current_version=$3 where person_id=$1 and id=$2',[principal.personId,id,version]);
    } else {
      await q.query('insert into emba_memory (id,person_id,kind,org_id,loop_id,current_version) values ($1,$2,$3,$4,$5,1)',[id,principal.personId,data.kind,data.orgId,data.loopId]);
    }
    await q.query(`insert into emba_memory_version (person_id,memory_id,version,text,category,place,strength,confidence,status,starts_at,ends_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[principal.personId,id,version,data.text,data.category,data.place,data.strength,data.confidence,data.status,data.startsAt,data.endsAt]);
    await q.query('insert into emba_memory_operation (person_id,operation_id,request_hash,memory_id,version,evidence_kind) values ($1,$2,$3,$4,$5,$6)',
      [principal.personId,data.operationId,hash,id,version,data.id?'correction':'explicit']);
    await audit(q,principal,'memory:write',id,leaseId);
    return {id,version};
  });
}

export async function listMemory(db: Db, principal: Principal, input: unknown): Promise<{items:MemoryItem[];truncated:boolean}> {
  const data = memoryQuerySchema.parse(input);
  return db.tx(async q => {
    const leaseId = await authorize(q,principal,'memory:read',data);
    const { rows } = await q.query<MemoryItem>(
      `select m.id,m.kind,v.version,v.text,v.category,v.place,v.strength,v.confidence,v.evidence_count as "evidenceCount",v.status,
       v.starts_at as "startsAt",v.ends_at as "endsAt",v.confirmed_at as "confirmedAt"
       from emba_memory m join emba_memory_version v on v.person_id=m.person_id and v.memory_id=m.id and v.version=m.current_version
       where m.person_id=$1 and m.org_id is not distinct from $2::uuid and m.loop_id is not distinct from $3::uuid
       and v.status='active' and (v.ends_at is null or v.ends_at > clock_timestamp())
       and ($4::text is null or v.place is null or lower(v.place)=lower($4))
       order by v.confirmed_at desc,m.id limit $5`,[principal.personId,data.orgId,data.loopId,data.place??null,data.limit+1]);
    await authorize(q,principal,'memory:read',data);
    await audit(q,principal,'memory:read',null,leaseId);
    return {items:rows.slice(0,data.limit),truncated:rows.length>data.limit};
  });
}
