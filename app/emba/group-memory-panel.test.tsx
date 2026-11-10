import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {setDb,type Db} from '@/lib/db';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {publishGroupNote} from '@/lib/emba/group-memory';
import {registerGroupAddress} from '@/lib/emba/groups';
import {GroupMemoryPanel} from './group-memory-panel';
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});
beforeEach(async()=>{await t.reset();setDb(t.db);});
afterEach(()=>{cleanup();setDb(t.db);});afterAll(async()=>{await t.close();});
it('shows handle registration to the root owner',async()=>{
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 render(await GroupMemoryPanel({principal:f.organizer,...f.vietnam}));
 expect(screen.getByText('Register a group handle')).toBeInTheDocument();
});
it('does not show root-only registration to a child-loop owner',async()=>{
 const f=await seedEmbaFixture(t.db);
 await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'owner')",[f.orgId,f.vietnam.loopId,f.memberA.personId]);
 render(await GroupMemoryPanel({principal:f.memberA,...f.vietnam}));
 expect(screen.getByRole('heading',{name:'Shared group notes'})).toBeInTheDocument();
 expect(screen.queryByText('Register a group handle')).not.toBeInTheDocument();
});
it('retains address, note-version and authority locks in one transaction until the panel snapshot exists',async()=>{
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'cohort',slug:'trip'});
 await publishGroupNote(t.db,f.memberA,{...f.vietnam,operationId:randomUUID(),text:'CURRENT_NOTE_CANARY'});
 let transactions=0;const statements:string[]=[];
 const observed:Db={...t.db,tx:fn=>{transactions++;return t.db.tx(async q=>{
  const result=await fn({query:async<T,>(sql:string,params?:unknown[])=>{statements.push(sql);return q.query<T>(sql,params);}});
  // The React snapshot is constructed before this transaction releases locks.
  expect(result).toHaveProperty('props');return result;
 });}};
 setDb(observed);render(await GroupMemoryPanel({principal:f.memberA,...f.vietnam}));
 expect(screen.getByText('CURRENT_NOTE_CANARY',{selector:'p'})).toBeInTheDocument();
 expect(screen.getByText('@cohort/trip')).toBeInTheDocument();expect(transactions).toBe(1);
 expect(statements.some(sql=>sql.includes('for share of a,o,l'))).toBe(true);
 expect(statements.some(sql=>sql.includes('for share of m,v'))).toBe(true);
});
it('discards the composed output when final authority is revoked',async()=>{
 const f=await seedEmbaFixture(t.db);
 await publishGroupNote(t.db,f.memberA,{...f.vietnam,operationId:randomUUID(),text:'DO_NOT_RENDER_CANARY'});
 let readNote=false;
 const changed:Db={...t.db,tx:fn=>t.db.tx(q=>fn({query:async<T,>(sql:string,params?:unknown[])=>{
  const result=await q.query<T>(sql,params);
  if(sql.includes('for share of m,v'))readNote=true;
  if(readNote&&sql.startsWith('insert into emba_audit'))await q.query('update emba_membership set revoked_at=now() where person_id=$1',[f.memberA.personId]);
  return result;
 }}))};
 setDb(changed);render(await GroupMemoryPanel({principal:f.memberA,...f.vietnam}));
 expect(screen.getByRole('heading',{name:'Shared group notes unavailable'})).toBeInTheDocument();
 expect(screen.queryByText('DO_NOT_RENDER_CANARY')).not.toBeInTheDocument();
});
