import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {auth,currentUser,clerkClient} from '@clerk/nextjs/server';
import {headers} from 'next/headers';
import {openTestDb,type TestDb} from '@/test/db';
import {clerkIssuer,getClerkPortalPrincipal} from '@/lib/emba/clerk-identity';
import {deletePersonalData,exportPersonalData} from '@/lib/emba/privacy';
import {authenticate} from '@/lib/emba/access';
import {TextNotifier} from '@/lib/notify/text';
vi.mock('@clerk/nextjs/server',()=>({auth:vi.fn(),currentUser:vi.fn(),clerkClient:vi.fn()}));
vi.mock('next/headers',()=>({headers:vi.fn(async()=>new Headers())}));
let t:TestDb;
const issuer='https://example.clerk.accounts.dev';
beforeAll(async()=>{t=await openTestDb();});
beforeEach(async()=>{
 await t.reset();vi.stubEnv('LOOP_AUTH_PROVIDER','clerk');vi.stubEnv('CLERK_SECRET_KEY','synthetic');
 vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY','pk_test_'+Buffer.from('example.clerk.accounts.dev$').toString('base64'));
 vi.stubEnv('LOOP_AUTH_ISSUER',issuer);
 vi.mocked(headers).mockResolvedValue(new Headers());
 session('user_a');
});
afterAll(async()=>{await t.close();});afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
function session(id:string,email='member@example.test') {
 vi.mocked(auth).mockResolvedValue({isAuthenticated:true,tokenType:'session_token',userId:id,sessionId:'sess',actor:null,sessionClaims:{iss:issuer,sub:id,exp:Date.now()/1000+600}} as never);
 vi.mocked(currentUser).mockResolvedValue({id,primaryEmailAddressId:'email',emailAddresses:[{id:'email',emailAddress:email,verification:{status:'verified'}}]} as never);
 vi.mocked(clerkClient).mockResolvedValue({sessions:{getSession:async()=>({id:'sess',userId:id,status:'active',actor:null,expireAt:Date.now()+600000})}} as never);
}
it('creates one private phone-free identity without legacy linking or membership, and skips SMS',async()=>{
 const a=await getClerkPortalPrincipal(t.db),again=await getClerkPortalPrincipal(t.db);
 expect(a?.personId).toBe(again?.personId);expect(a?.verifiedEmail).toBe('member@example.test');expect(a?.authenticatedAt).toBeNull();
 expect((await t.db.query('select phone,name,sms_opt_out from person')).rows).toEqual([{phone:null,name:'Member',sms_opt_out:true}]);
 expect((await t.db.query('select * from emba_membership')).rows).toEqual([]);
 session('user_b');const b=await getClerkPortalPrincipal(t.db);expect(b?.personId).not.toBe(a?.personId);
 const send=vi.fn();
 const n=new TextNotifier(t.db,{channel:'sms',send});
 await n.code({boardId:null,personId:a!.personId,phone:'+16075551234',code:'123456'});
 expect(send).not.toHaveBeenCalled();
});
it('never reenrolls revoked or deleted identities',async()=>{
 const p=(await getClerkPortalPrincipal(t.db))!;
 await t.db.query('update emba_identity set revoked_at=now() where person_id=$1',[p.personId]);
 expect(await getClerkPortalPrincipal(t.db)).toBeNull();
 await t.db.query('update emba_identity set revoked_at=null where person_id=$1',[p.personId]);
 const fresh=(await authenticate(t.db,'synthetic',async()=>({issuer,subject:'user_a',expiresAt:Date.now()+60000,authenticatedAt:Date.now(),verifiedEmail:'member@example.test'})))!;
 await deletePersonalData(t.db,fresh);
 expect(await getClerkPortalPrincipal(t.db)).toBeNull();
 expect((await t.db.query('select * from person')).rows).toHaveLength(1);
});
it('rejects missing verified primary email, cross-account user/session, and bearer inputs',async()=>{
 vi.mocked(currentUser).mockResolvedValue({id:'user_a',primaryEmailAddressId:'email',emailAddresses:[{id:'email',emailAddress:'member@example.test',verification:{status:'unverified'}}]} as never);
 expect(await getClerkPortalPrincipal(t.db)).toBeNull();
 session('user_a');vi.mocked(currentUser).mockResolvedValue({id:'user_b'} as never);
 expect(await getClerkPortalPrincipal(t.db)).toBeNull();
 session('user_a');vi.mocked(clerkClient).mockResolvedValue({sessions:{getSession:async()=>({id:'sess',userId:'user_b',status:'active'})}} as never);
 expect(await getClerkPortalPrincipal(t.db)).toBeNull();
 session('user_a');vi.mocked(headers).mockResolvedValue(new Headers({authorization:'Bearer synthetic'}));
 expect(await getClerkPortalPrincipal(t.db)).toBeNull();
 expect((await t.db.query('select * from person')).rows).toEqual([]);
});
it('rejects configuration issuer mismatch and unconfigured provider',async()=>{
 expect(clerkIssuer()).toBe(issuer);vi.stubEnv('LOOP_AUTH_ISSUER','https://other.test');
 expect(clerkIssuer()).toBeNull();expect(await getClerkPortalPrincipal(t.db)).toBeNull();
 vi.stubEnv('LOOP_AUTH_PROVIDER','');expect(await getClerkPortalPrincipal(t.db)).toBeNull();
});
it('permits privacy export and deletion after a recent signed factor verification',async()=>{
 session('user_fresh');
 const iat=Math.floor(Date.now()/1000);
 vi.mocked(auth).mockResolvedValue({isAuthenticated:true,tokenType:'session_token',userId:'user_fresh',sessionId:'sess',actor:null,sessionClaims:{iss:issuer,sub:'user_fresh',exp:iat+600,iat,fva:[0,-1]}} as never);
 const p=(await getClerkPortalPrincipal(t.db))!;
 expect(p.authenticatedAt).toBe((iat-60)*1000);
 expect(await exportPersonalData(t.db,p)).toMatchObject({scope:'emba-pilot'});
 expect(await deletePersonalData(t.db,p)).toMatchObject({deleted:true});
 expect(await getClerkPortalPrincipal(t.db)).toBeNull();
});
it('never treats token refresh or session activity as a fresh factor verification',async()=>{
 session('user_stale');
 const now=Math.floor(Date.now()/1000);
 for(const claims of [{iat:now,fva:[5,-1]},{iat:now-120,fva:[3,-1]},{iat:now},{iat:now,fva:[-1,-1]},{iat:now,fva:[0.5,-1]},{iat:now+60,fva:[0,-1]},{iat:now,fva:[0]},{iat:now,fva:['0',-1]}]) {
  vi.mocked(auth).mockResolvedValue({isAuthenticated:true,tokenType:'session_token',userId:'user_stale',sessionId:'sess',actor:null,sessionClaims:{iss:issuer,sub:'user_stale',exp:now+600,...claims}} as never);
  const p=(await getClerkPortalPrincipal(t.db))!;
  await expect(exportPersonalData(t.db,p)).rejects.toThrow('forbidden');
  await expect(deletePersonalData(t.db,p)).rejects.toThrow('forbidden');
 }
});
