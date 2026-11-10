import 'server-only';
import { z } from 'zod';
import type { Db,Q } from '../db';
import { canAccessLoop,canAccessPersonal,type Principal } from './access';
import { authorize,audit,requireFirstParty } from './consent';
import { eligibleActivityParticipant } from './activities';
import { EmbaError } from './errors';

/** Called while holding activity FOR UPDATE; recipients get no private reasons. */
export async function enqueueActivityUpdate(q:Q,a:{id:string;revision:number},kind:string,recipientRevision=a.revision) {
  const {rows:[event]}=await q.query<{event_version:number}>('update emba_activity set event_version=event_version+1 where id=$1 returning event_version',[a.id]);
  await q.query(`with items as (
    insert into emba_inbox(person_id,activity_id,revision,event_version,kind)
    select person_id,activity_id,$2,$3,$4 from emba_commitment where activity_id=$1 and revision=$5
    on conflict do nothing returning id)
    insert into emba_outbox(inbox_id) select id from items on conflict do nothing`,[a.id,a.revision,event.event_version,kind,recipientRevision]);
}
type InboxItem={id:string;activity_id:string;revision:number;kind:string;created_at:string;acknowledged_at:string|null};
type ScopedItem=InboxItem & {org_id:string;loop_id:string;person_id:string};
export const inboxQuerySchema=z.strictObject({cursor:z.uuid().optional(),limit:z.number().int().min(1).max(100).default(50)});
export async function pollInbox(db:Db,p:Principal,input:unknown={}) {
  const d=inboxQuerySchema.parse(input);
  return db.tx(async q=>{
    if(!await canAccessPersonal(q,p,p.personId)||p.clientId!==null&&!p.scopes.includes('plan:read'))throw new EmbaError('forbidden');
    let before:{before_created:string;before_id:string}|undefined;
    if(d.cursor) {
      const {rows:[cursor]}=await q.query<{before_created:string;before_id:string}>('select before_created,before_id from emba_inbox_cursor where id=$1 and person_id=$2 and client_id is not distinct from $3::text and expires_at>clock_timestamp()',[d.cursor,p.personId,p.clientId]);
      if(!cursor)throw new EmbaError('forbidden');before=cursor;
    }
    const {rows}=await q.query<ScopedItem>(`select i.id,i.activity_id,i.revision,i.kind,i.created_at,i.acknowledged_at,i.person_id,a.org_id,a.loop_id
      from emba_inbox i join emba_activity a on a.id=i.activity_id and a.revision=i.revision and a.event_version=i.event_version
      where i.person_id=$1 and ($2::timestamptz is null or (i.created_at,i.id)<($2,$3::uuid))
      order by i.created_at desc,i.id desc limit $4`,[p.personId,before?.before_created??null,before?.before_id??null,d.limit+1]);
    const items:InboxItem[]=[];
    for(const row of rows.slice(0,d.limit)) {
      if(!await canAccessLoop(q,p,row.org_id,row.loop_id,'commit'))continue;
      const scopedLease=await authorize(q,p,'plan:read',{orgId:row.org_id,loopId:row.loop_id});
      await audit(q,p,'inbox:read',row.id,scopedLease);
      items.push({id:row.id,activity_id:row.activity_id,revision:row.revision,kind:row.kind,created_at:row.created_at,acknowledged_at:row.acknowledged_at});
    }
    let nextCursor:string|null=null;
    if(rows.length>d.limit) {
      const last=rows[d.limit-1];
      const {rows:[cursor]}=await q.query<{id:string}>('insert into emba_inbox_cursor(person_id,client_id,before_created,before_id) values($1,$2,$3,$4) returning id',[p.personId,p.clientId,last.created_at,last.id]);nextCursor=cursor.id;
    }
    if(!items.length)await audit(q,p,'inbox:read');return {items,nextCursor};
  });
}
export async function listInbox(db:Db,p:Principal) {return (await pollInbox(db,p,{limit:100})).items;}
export async function acknowledgeInbox(db:Db,p:Principal,id:string) {
  z.uuid().parse(id);
  return db.tx(async q=>{
    await requireFirstParty(q,p);
    const {rows:[item]}=await q.query<{org_id:string;loop_id:string}>(`select a.org_id,a.loop_id from emba_inbox i join emba_activity a on a.id=i.activity_id and a.revision=i.revision and a.event_version=i.event_version where i.id=$1 and i.person_id=$2`,[id,p.personId]);
    if(!item||!await canAccessLoop(q,p,item.org_id,item.loop_id,'commit'))throw new EmbaError('forbidden');
    await q.query('update emba_inbox set acknowledged_at=coalesce(acknowledged_at,clock_timestamp()) where id=$1 and person_id=$2',[id,p.personId]);
    await audit(q,p,'inbox:acknowledge',id);
  });
}
/** Trusted worker; transport must honor inbox_id as its idempotency key. No human acknowledgement. */
export async function deliverPending(db:Db,send:(message:{id:string;personId:string;kind:string})=>Promise<void>,limit=50) {
  z.number().int().min(1).max(100).parse(limit);
  return db.tx(async q=>{
    const {rows}=await q.query<{id:string;personId:string;kind:string;org_id:string;loop_id:string;current:boolean}>(`select i.id,i.person_id as "personId",i.kind,a.org_id,a.loop_id,(a.revision=i.revision and a.event_version=i.event_version) as current
      from emba_outbox o join emba_inbox i on i.id=o.inbox_id join emba_activity a on a.id=i.activity_id
      where o.delivered_at is null order by i.created_at limit $1 for update of o,a skip locked`,[limit]);
    for(const message of rows) {
      if(!message.current||!await eligibleActivityParticipant(q,message,message.personId)) {
        await q.query('delete from emba_outbox where inbox_id=$1',[message.id]);continue;
      }
      await q.query('update emba_outbox set attempts=attempts+1 where inbox_id=$1',[message.id]);
      try {await send({id:message.id,personId:message.personId,kind:message.kind});await q.query('update emba_outbox set delivered_at=clock_timestamp() where inbox_id=$1',[message.id]);} catch { /* Durable row remains retryable. */ }
    }
    return rows.length;
  });
}
