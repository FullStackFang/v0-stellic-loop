import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {auth,currentUser,clerkClient} from '@clerk/nextjs/server';
import {headers} from 'next/headers';
import {openTestDb,type TestDb} from '@/test/db';
import {clerkEmailsOf,clerkIssuer,clerkSignIn,getClerkPortalPrincipal} from '@/lib/emba/clerk-identity';
import type {Db} from '@/lib/db';
import {addMemberNow} from '@/lib/emba/add-member';
import {issueInvitation} from '@/lib/emba/invitations';
import {deletePersonalData,exportPersonalData} from '@/lib/emba/privacy';
import {authenticate,canAccessPersonal} from '@/lib/emba/access';
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
it('takes the name from the sign-in account, and tags a member whose name arrives after they joined',async()=>{
 const named=(extra:object)=>vi.mocked(currentUser).mockResolvedValue({id:'user_a',primaryEmailAddressId:'email',emailAddresses:[{id:'email',emailAddress:'member@example.test',verification:{status:'verified'}}],...extra} as never);
 const p=(await getClerkPortalPrincipal(t.db))!;
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Test') returning id");
 await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,p.personId]);
 named({firstName:'Danny',lastName:'Lau'});await getClerkPortalPrincipal(t.db);
 expect((await t.db.query('select name from person where id=$1',[p.personId])).rows).toEqual([{name:'Danny Lau'}]);
 expect((await t.db.query('select handle from emba_member_handle where person_id=$1',[p.personId])).rows).toEqual([{handle:'danny'}]);
 // A name once known is not replaced by a later change at the sign-in provider.
 named({firstName:'Dan',lastName:null});await getClerkPortalPrincipal(t.db);
 expect((await t.db.query('select name from person where id=$1',[p.personId])).rows).toEqual([{name:'Danny Lau'}]);
 session('user_b');vi.mocked(currentUser).mockResolvedValue({id:'user_b',firstName:'Mary',lastName:'Cha',primaryEmailAddressId:'email',emailAddresses:[{id:'email',emailAddress:'mary@example.test',verification:{status:'verified'}}]} as never);
 const b=(await getClerkPortalPrincipal(t.db))!;
 expect((await t.db.query('select name from person where id=$1',[b.personId])).rows).toEqual([{name:'Mary Cha'}]);
});
// The database as a request sees it, with every statement and every transaction it is asked for written down.
function watched() {
 const seen={statements:[] as string[],transactions:0};
 const db:Db={query:(text,params)=>{seen.statements.push(text);return t.db.query(text,params);},
  tx:fn=>{seen.transactions++;return t.db.tx(q=>fn({query:(text,params)=>{seen.statements.push(text);return q.query(text,params);}}));}};
 return {db,seen};
}
it('identifies a known account with one statement, no transaction and no lock, and says whether they are in a group',async()=>{
 const first=watched(),a=(await clerkSignIn(first.db))!;
 expect(first.seen.transactions).toBe(1);expect(a.inAGroup).toBeNull();
 const again=watched(),b=(await clerkSignIn(again.db))!;
 expect(again.seen).toMatchObject({transactions:0});expect(again.seen.statements).toHaveLength(1);
 expect(again.seen.statements[0]).not.toMatch(/for (update|share)|advisory|insert|update /i);
 expect(b.principal.personId).toBe(a.principal.personId);expect(b.inAGroup).toBe(false);
 // The principal is the same kind the locked path makes: it opens what a principal opens.
 expect(await t.db.tx(q=>canAccessPersonal(q,b.principal,b.principal.personId))).toBe(true);
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Test') returning id");
 const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'root') returning id",[org.id]);
 await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,a.principal.personId]);
 await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')",[org.id,loop.id,a.principal.personId]);
 expect((await clerkSignIn(t.db))!.inAGroup).toBe(true);
 await t.db.query('update emba_role set revoked_at=now()');
 expect((await clerkSignIn(t.db))!.inAGroup).toBe(false);
});
it('takes the locked path, once, for a member still unnamed whose name the provider now has',async()=>{
 await getClerkPortalPrincipal(t.db);
 vi.mocked(currentUser).mockResolvedValue({id:'user_a',firstName:'Danny',lastName:'Lau',primaryEmailAddressId:'email',emailAddresses:[{id:'email',emailAddress:'member@example.test',verification:{status:'verified'}}]} as never);
 const named=watched();await getClerkPortalPrincipal(named.db);
 expect(named.seen.transactions).toBe(1);
 expect((await t.db.query('select name from person')).rows).toEqual([{name:'Danny Lau'}]);
 const after=watched();await getClerkPortalPrincipal(after.db);
 expect(after.seen.transactions).toBe(0);
});
it('reads the verified address of each person in one request, leaving out anyone the provider does not return',async()=>{
 const a=(await getClerkPortalPrincipal(t.db))!;session('user_b');const b=(await getClerkPortalPrincipal(t.db))!;
 const getUserList=vi.fn(async()=>({data:[{id:'user_a',primaryEmailAddressId:'e',emailAddresses:[{id:'e',emailAddress:' A@Example.Test',verification:{status:'verified'}}]},
  {id:'user_b',primaryEmailAddressId:'e',emailAddresses:[{id:'e',emailAddress:'b@example.test',verification:{status:'unverified'}}]}]}));
 vi.mocked(clerkClient).mockResolvedValue({users:{getUserList}} as never);
 expect(await clerkEmailsOf(t.db,[a.personId,b.personId])).toEqual({[a.personId]:'a@example.test'});
 expect(getUserList).toHaveBeenCalledWith({userId:['user_a','user_b'],limit:100});
 expect(await clerkEmailsOf(t.db,[])).toEqual({});
});
it('adds a person to a group at once by address, named and tagged, and lets only an owner or organizer do it',async()=>{
 const owner=(await getClerkPortalPrincipal(t.db))!;
 const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Test') returning id");
 const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'root') returning id",[org.id]);
 await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,owner.personId]);
 await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'owner')",[org.id,loop.id,owner.personId]);
 const accountFor=vi.fn(async()=>'user_new'),input={orgId:org.id,loopId:loop.id,email:' Jn586@Example.Test ',name:'Jayashree Nagarajachar',role:'member' as const};
 // An earlier invitation to the same address is answered by adding them.
 await issueInvitation(t.db,owner,{orgId:org.id,loopId:loop.id,recipientEmail:'jn586@example.test',role:'member',expiresAt:new Date(Date.now()+3600000).toISOString()});
 await addMemberNow(t.db,owner,input,accountFor);
 expect(accountFor).toHaveBeenCalledWith('jn586@example.test','Jayashree Nagarajachar');
 expect((await t.db.query(`select p.name,r.role,h.handle from person p join emba_identity i on i.person_id=p.id and i.subject='user_new'
  join emba_role r on r.person_id=p.id and r.revoked_at is null join emba_membership m on m.person_id=p.id and m.revoked_at is null join emba_member_handle h on h.person_id=p.id`)).rows)
  .toEqual([{name:'Jayashree Nagarajachar',role:'member',handle:'jayashree'}]);
 expect((await t.db.query('select 1 from emba_invitation where accepted_at is null and revoked_at is null')).rows).toEqual([]);
 // The person added signs in later and is that same member; they may not add anyone.
 session('user_new','jn586@example.test');const added=(await getClerkPortalPrincipal(t.db))!;
 await expect(addMemberNow(t.db,added,{...input,email:'other@example.test'},accountFor)).rejects.toThrow();
 expect(accountFor).toHaveBeenCalledTimes(1);
 // A failure at the sign-in provider leaves no invitation behind.
 await expect(addMemberNow(t.db,owner,{...input,email:'third@example.test'},async()=>{throw new Error('down');})).rejects.toThrow('down');
 expect((await t.db.query('select 1 from emba_invitation where accepted_at is null and revoked_at is null')).rows).toEqual([]);
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
