// @vitest-environment node
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {publishGroupNote,withdrawGroupNote,readGroupMemory,searchGroupMemory} from '@/lib/emba/group-memory';
import {authenticate} from '@/lib/emba/access';
import {grantLease,revokeLease} from '@/lib/emba/consent';
import {saveMemory} from '@/lib/emba/memory';
import type {Db} from '@/lib/db';
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});beforeEach(async()=>{await t.reset();});afterAll(async()=>{await t.close();});
const note=(scope:{orgId:string;loopId:string},text='Meet at the hotel')=>({...scope,operationId:randomUUID(),text});
it('publishes only explicit shared notes and never returns private wants',async()=>{
 const f=await seedEmbaFixture(t.db),input=note(f.vietnam),receipt=await publishGroupNote(t.db,f.memberA,input);
 await saveMemory(t.db,f.memberA,{operationId:randomUUID(),kind:'want',text:'PRIVATE_GROUP_MEMORY_CANARY',category:'other',strength:1,confidence:1});
 const result=await searchGroupMemory(t.db,f.memberB,{...f.vietnam});
 expect(result.items).toHaveLength(1);expect(result.items[0]).toMatchObject({id:receipt.recordId,text:input.text,kind:'note',provenance:'member_submission'});
 expect(JSON.stringify(result)).not.toContain('PRIVATE_GROUP_MEMORY_CANARY');
 expect((await searchGroupMemory(t.db,f.memberA,{...f.vietnam,query:'PRIVATE_GROUP_MEMORY_CANARY'})).items).toEqual([]);
 expect((await searchGroupMemory(t.db,f.memberA,{...f.estonia})).items).toEqual([]);
 await expect(searchGroupMemory(t.db,f.nonmember,f.vietnam)).rejects.toThrow('forbidden');
 await expect(publishGroupNote(t.db,f.memberA,{...note(f.vietnam),kind:'decision'})).rejects.toThrow();
 await expect(publishGroupNote(t.db,f.memberA,{...note(f.vietnam),sources:[]})).rejects.toThrow();
});
it('serializes competing corrections and preserves exactly one winning new version',async()=>{
 const f=await seedEmbaFixture(t.db),first=await publishGroupNote(t.db,f.memberA,note(f.vietnam));
 const results=await Promise.allSettled(['First change','Second change'].map(text=>publishGroupNote(t.db,f.memberA,{...note(f.vietnam,text),recordId:first.recordId,expectedVersion:1})));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
 expect((await t.db.query('select version from emba_group_memory_version where record_id=$1',[first.recordId])).rows).toHaveLength(2);
});
it('bounds UTF-8 output and strict candidate size, and denies public table reads',async()=>{
 const f=await seedEmbaFixture(t.db);
 expect((await t.db.query<{server_encoding:string}>('show server_encoding')).rows[0].server_encoding).toBe('UTF8');
 for(let i=0;i<8;i++)await publishGroupNote(t.db,f.memberA,note(f.vietnam,'旅'.repeat(2000)));
 const result=await searchGroupMemory(t.db,f.memberA,f.vietnam);expect(result.truncated).toBe(true);expect(Buffer.byteLength(JSON.stringify(result),'utf8')).toBeLessThanOrEqual(32768);
 await expect(publishGroupNote(t.db,f.memberA,note(f.vietnam,'\u0001'.repeat(2000)))).rejects.toThrow();
 for(const role of ['anon','authenticated'])await expect(t.db.tx(async q=>{await q.query(`set local role ${role}`);await q.query('select * from emba_group_memory');})).rejects.toThrow();
});
it('enforces author correction, organizer moderation, follower read-only and immutable history',async()=>{
 const f=await seedEmbaFixture(t.db),first=await publishGroupNote(t.db,f.memberA,note(f.vietnam));
 const correction={...note(f.vietnam,'Changed meeting'),recordId:first.recordId,expectedVersion:1};
 await expect(publishGroupNote(t.db,f.memberB,correction)).rejects.toThrow('forbidden');
 const second=await publishGroupNote(t.db,f.organizer,correction);expect(second.version).toBe(2);
 await expect(publishGroupNote(t.db,f.memberA,{...correction,operationId:randomUUID()})).rejects.toThrow('conflict');
 expect((await t.db.query('select text from emba_group_memory_version where record_id=$1 order by version',[first.recordId])).rows).toEqual([{text:'Meet at the hotel'},{text:'Changed meeting'}]);
 await t.db.query("update emba_role set role='follower' where person_id=$1",[f.memberA.personId]);
 expect((await readGroupMemory(t.db,f.memberA,{...f.vietnam,recordId:first.recordId})).version).toBe(2);
 await expect(publishGroupNote(t.db,f.memberA,note(f.vietnam))).rejects.toThrow('forbidden');
});
it('returns minimal exact retry receipts after correction/withdrawal without exposing withdrawn history',async()=>{
 const f=await seedEmbaFixture(t.db),input=note(f.vietnam),first=await publishGroupNote(t.db,f.memberA,input);
 expect(await publishGroupNote(t.db,f.memberA,input)).toEqual(first);
 await expect(publishGroupNote(t.db,f.memberA,{...input,text:'Changed retry'})).rejects.toThrow('conflict');
 const withdrawal={...f.vietnam,operationId:randomUUID(),recordId:first.recordId,expectedVersion:1};
 const removed=await withdrawGroupNote(t.db,f.memberA,withdrawal);expect(removed).toMatchObject({version:2,status:'withdrawn'});
 expect(await withdrawGroupNote(t.db,f.memberA,withdrawal)).toEqual(removed);
 expect(await publishGroupNote(t.db,f.memberA,input)).toEqual({...first,status:'withdrawn'});
 await expect(readGroupMemory(t.db,f.memberA,{...f.vietnam,recordId:first.recordId})).rejects.toThrow('not_found');
 await expect(readGroupMemory(t.db,f.memberA,{...f.vietnam,recordId:first.recordId,version:1})).rejects.toThrow();
 expect((await searchGroupMemory(t.db,f.memberA,{...f.vietnam,query:'hotel'})).items).toEqual([]);
});
it('requires exact delegated read lease and denies direct delegated writes',async()=>{
 const f=await seedEmbaFixture(t.db),first=await publishGroupNote(t.db,f.memberA,note(f.vietnam));
 const agent=(await authenticate(t.db,'fixture',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,expiresAt:Date.now()+60000,clientId:'shared-agent',scopes:['plan:read']})))!;
 await expect(searchGroupMemory(t.db,agent,f.vietnam)).rejects.toThrow('forbidden');
 const lease=await grantLease(t.db,f.memberA,{...f.vietnam,clientId:'shared-agent',actions:['plan:read'],expiresAt:'2099-01-01T00:00:00Z'});
 expect((await readGroupMemory(t.db,agent,{...f.vietnam,recordId:first.recordId})).version).toBe(1);
 await expect(publishGroupNote(t.db,agent,note(f.vietnam))).rejects.toThrow('forbidden');
 await revokeLease(t.db,f.memberA,lease.id);
 await expect(readGroupMemory(t.db,agent,{...f.vietnam,recordId:first.recordId})).rejects.toThrow('forbidden');
});
it('rolls back writes and denies output when auditing fails',async()=>{
 const f=await seedEmbaFixture(t.db),input=note(f.vietnam);
 const broken:Db={query:t.db.query.bind(t.db),tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{if(sql.startsWith('insert into emba_audit'))throw new Error('audit down');return q.query<T>(sql,params);}}))};
 await expect(publishGroupNote(broken,f.memberA,input)).rejects.toThrow('audit down');
 expect((await searchGroupMemory(t.db,f.memberA,f.vietnam)).items).toEqual([]);
 await publishGroupNote(t.db,f.memberA,input);
 await expect(searchGroupMemory(broken,f.memberA,f.vietnam)).rejects.toThrow('audit down');
});
it('rechecks membership before output and operation retry',async()=>{
 const f=await seedEmbaFixture(t.db),input=note(f.vietnam);await publishGroupNote(t.db,f.memberA,input);
 const revoked:Db={query:t.db.query.bind(t.db),tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
  const result=await q.query<T>(sql,params);
  if(sql.includes('from emba_group_memory m join'))await q.query('update emba_membership set revoked_at=now() where person_id=$1',[f.memberA.personId]);
  return result;
 }}))};
 await expect(searchGroupMemory(revoked,f.memberA,f.vietnam)).rejects.toThrow('forbidden');
 await t.db.query('update emba_membership set revoked_at=now() where person_id=$1',[f.memberA.personId]);
 await expect(publishGroupNote(t.db,f.memberA,input)).rejects.toThrow('forbidden');
});
