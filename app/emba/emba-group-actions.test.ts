// @vitest-environment node
import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate} from '@/lib/emba/access';
import {grantLease,revokeLease} from '@/lib/emba/consent';
import {prepareGroupMemory} from '@/lib/emba/group-actions';
import {withPortalTestSession} from '@/lib/emba/portal-session';
import {reviewSharedNote,approveSharedNote,saveSharedNote,withdrawSharedNote} from './group-memory-actions';
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});beforeEach(async()=>{await t.reset();vi.stubEnv('LOOP_AUTH_CLIENT_IDS','claude-test');vi.stubEnv('LOOP_AUTH_ISSUER','https://issuer.example');vi.stubEnv('LOOP_AUTH_AUDIENCE','https://loop.example/api/mcp');vi.stubEnv('LOOP_AUTH_JWKS_URL','https://issuer.example/jwks');});afterEach(()=>vi.unstubAllEnvs());afterAll(async()=>{await t.close();});
const idle={status:'idle' as const,message:''};
function form(values:Record<string,string>){const d=new FormData();for(const [k,v]of Object.entries(values))d.set(k,v);return d;}
async function fixture(){
 const f=await seedEmbaFixture(t.db);
 const p=(await authenticate(t.db,'fixture',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,expiresAt:Date.now()+60000,clientId:'claude-test',scopes:['group-memory:write']})))!;
 const lease=await grantLease(t.db,f.memberA,{...f.vietnam,clientId:'claude-test',actions:['group-memory:write'],expiresAt:'2099-01-01T00:00:00Z'});
 const payload={...f.vietnam,recordId:randomUUID(),operationId:randomUUID(),mutation:'publish',expectedVersion:1,text:'Reviewed note'};
 return {...f,p,lease,payload,review:(await prepareGroupMemory(t.db,p,payload)).review};
}
it('requires checked first-party approval and rejects injected review fields',async()=>{
 const f=await fixture(),binding=JSON.stringify(f.review);
 expect((await reviewSharedNote(idle,form({binding}))).status).toBe('error');
 expect((await withPortalTestSession(f.p,()=>approveSharedNote(idle,form({binding,reviewed:'yes'})))).status).toBe('error');
 expect((await withPortalTestSession(f.memberA,()=>reviewSharedNote(idle,form({binding})))).groupReview).toMatchObject({text:f.payload.text,clientId:'claude-test'});
 expect((await withPortalTestSession(f.memberA,()=>approveSharedNote(idle,form({binding})))).status).toBe('error');
 expect((await t.db.query('select * from emba_confirmation')).rows).toEqual([]);
 for(const forged of [{...f.review,clientLabel:'Verified owner'},{...f.review,audience:'all members'},{...f.review,payload:{...f.payload,transcript:['RAW_CANARY']}}])expect((await withPortalTestSession(f.memberA,()=>reviewSharedNote(idle,form({binding:JSON.stringify(forged)})))).status).toBe('error');
 expect((await withPortalTestSession(f.memberA,()=>approveSharedNote(idle,form({binding,reviewed:'yes'})))).confirmationId).toEqual(expect.any(String));
 expect((await t.db.query('select * from emba_group_memory')).rows).toEqual([]);
});
it('revalidates consent between review and approval',async()=>{
 const f=await fixture(),data=form({binding:JSON.stringify(f.review),reviewed:'yes'});
 expect((await withPortalTestSession(f.memberA,()=>reviewSharedNote(idle,data))).status).toBe('success');
 await revokeLease(t.db,f.memberA,f.lease.id);
 expect((await withPortalTestSession(f.memberA,()=>approveSharedNote(idle,data))).status).toBe('error');
 expect((await t.db.query('select * from emba_confirmation')).rows).toEqual([]);
});
it('requires explicit review for direct shared publication and withdrawal',async()=>{
 const f=await fixture(),operationId=randomUUID(),data=form({...f.vietnam,operationId,text:'Manual shared note'});
 expect((await withPortalTestSession(f.memberA,()=>saveSharedNote(idle,data))).status).toBe('error');
 data.set('reviewed','yes');expect((await withPortalTestSession(f.memberA,()=>saveSharedNote(idle,data))).status).toBe('success');
 const withdraw=form({...f.vietnam,operationId:randomUUID(),recordId:operationId,expectedVersion:'1'});
 expect((await withPortalTestSession(f.memberA,()=>withdrawSharedNote(idle,withdraw))).status).toBe('error');
 withdraw.set('reviewed','yes');expect((await withPortalTestSession(f.memberA,()=>withdrawSharedNote(idle,withdraw))).status).toBe('success');
 expect((await t.db.query('select status from emba_group_memory where id=$1',[operationId])).rows).toEqual([{status:'withdrawn'}]);
});
