import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate} from '@/lib/emba/access';
import {grantLease,revokeLease} from '@/lib/emba/consent';
import {prepareGroupMemory,approveGroupMemory,executeGroupMemory} from '@/lib/emba/group-actions';
import {readGroupMemory} from '@/lib/emba/group-memory';
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>t?.close());
beforeEach(async()=>{await t.reset();vi.stubEnv('LOOP_AUTH_ISSUER','https://issuer.example');vi.stubEnv('LOOP_AUTH_AUDIENCE','https://loop.example/api/mcp');vi.stubEnv('LOOP_AUTH_JWKS_URL','https://issuer.example/jwks');vi.stubEnv('LOOP_AUTH_CLIENT_IDS','claude-test,other-test');});
afterEach(()=>vi.unstubAllEnvs());
async function fixture(){
 const f=await seedEmbaFixture(t.db);
 const p=await authenticate(t.db,'fixture',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,expiresAt:Date.now()+60000,clientId:'claude-test',scopes:['plan:read','group-memory:write']}));
 const lease=await grantLease(t.db,f.memberA,{...f.vietnam,clientId:'claude-test',actions:['plan:read','group-memory:write'],expiresAt:'2099-01-01T00:00:00Z'});
 const payload={...f.vietnam,recordId:randomUUID(),operationId:randomUUID(),mutation:'publish',expectedVersion:1,text:'Meet by the hotel lobby at nine.'};
 return {...f,p:p!,lease,payload};
}
it('prepares without persistence, requires exact first-party review, and safely recovers a lost response',async()=>{
 const f=await fixture(),prepared=await prepareGroupMemory(t.db,f.p,f.payload);
 expect((await t.db.query('select 1 from emba_group_memory')).rows).toHaveLength(0);
 const approval=await approveGroupMemory(t.db,f.memberA,prepared.review);
 await expect(executeGroupMemory(t.db,f.p,approval.id,{...f.payload,text:'Altered'})).rejects.toThrow();
 const receipt=await executeGroupMemory(t.db,f.p,approval.id,f.payload);
 expect(await executeGroupMemory(t.db,f.p,approval.id,f.payload)).toEqual(receipt);
 expect((await readGroupMemory(t.db,f.memberB,{...f.vietnam,recordId:receipt.recordId})).text).toBe(f.payload.text);
 expect((await t.db.query('select 1 from emba_group_memory_version')).rows).toHaveLength(1);
 await revokeLease(t.db,f.memberA,f.lease.id);
 await expect(executeGroupMemory(t.db,f.p,approval.id,f.payload)).rejects.toThrow('forbidden');
});
it('rejects unknown client labels, revoked review grants, transcript fields, and delegated approval',async()=>{
 const f=await fixture(),prepared=await prepareGroupMemory(t.db,f.p,f.payload);
 await expect(approveGroupMemory(t.db,f.memberA,{...prepared.review,clientId:'unknown'})).rejects.toThrow('forbidden');
 await expect(approveGroupMemory(t.db,f.p,prepared.review)).rejects.toThrow('forbidden');
 await expect(prepareGroupMemory(t.db,f.p,{...f.payload,messages:['RAW_CANARY']})).rejects.toThrow();
 await revokeLease(t.db,f.memberA,f.lease.id);
 await expect(approveGroupMemory(t.db,f.memberA,prepared.review)).rejects.toThrow('forbidden');
 expect(JSON.stringify((await t.db.query('select * from emba_audit')).rows)).not.toContain('RAW_CANARY');
});
