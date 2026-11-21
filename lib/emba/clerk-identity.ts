import 'server-only';
import {createHash} from 'node:crypto';
import {auth,clerkClient,currentUser} from '@clerk/nextjs/server';
import {headers} from 'next/headers';
import type {Db,Q} from '../db';
import {authenticate,type Principal} from './access';
import {cleanName,giveDefaultHandle,nameIfUnnamed,UNNAMED} from './member-name';

/** Public issuer comes from the configured publishable key, never a request. */
export function clerkIssuer():string|null {
 const key=process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
 if(!key||!/^pk_(test|live)_/.test(key)) return null;
 const decoded=Buffer.from(key.split('_').slice(2).join('_'),'base64').toString('utf8');
 if(!decoded.endsWith('$')) return null;
 const host=decoded.slice(0,-1);
 if(!/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/i.test(host)) return null;
 const issuer=`https://${host}`;
 return process.env.LOOP_AUTH_ISSUER&&process.env.LOOP_AUTH_ISSUER!==issuer?null:issuer;
}
export function clerkPortalConfigured():boolean {
 return process.env.LOOP_AUTH_PROVIDER==='clerk'&&!!process.env.CLERK_SECRET_KEY&&clerkIssuer()!==null;
}
// Clerk's signed fva tuple measures whole minutes since factor verification at
// token issuance. Use the oldest instant in that minute to avoid extending the
// five-minute privacy window through rounding or subsequent token refresh.
// https://clerk.com/docs/guides/sessions/session-tokens
function verifiedAt(claims:{iat?:unknown;fva?:unknown}):number|undefined {
 const {iat,fva}=claims;
 if(typeof iat!=='number'||!Number.isSafeInteger(iat)||iat<=0||iat*1000>Date.now()||!Array.isArray(fva)||fva.length!==2
  ||!fva.every(age=>typeof age==='number'&&Number.isSafeInteger(age)&&age>=-1)||fva[0]<0)return undefined;
 const at=(iat-(fva[0]+1)*60)*1000;
 return Number.isSafeInteger(at)&&at>0?at:undefined;
}
// RFC 9562 UUIDv5 (URL namespace). Stable issuer+subject identity lets the existing
// person-ID deletion ledger prevent reenrollment after emba_identity is purged.
function personId(issuer:string,subject:string):string {
 const hash=createHash('sha1').update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8','hex')).update(JSON.stringify([issuer,subject])).digest();
 hash[6]=(hash[6]&15)|80;hash[8]=(hash[8]&63)|128;
 const hex=hash.subarray(0,16).toString('hex');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
/**
 * A member's verified primary email address, read from the sign-in provider when a message is about to be sent.
 * Loopd keeps no copy of it. Null when the account is gone, banned or locked, or has no verified address.
 * It throws when the provider could not be asked, so the caller tries again later instead of giving up.
 */
export async function clerkEmailOf(database:Db,personId:string):Promise<string|null> {
 const issuer=clerkIssuer();
 if(!issuer||!clerkPortalConfigured())return null;
 const {rows:[identity]}=await database.query<{subject:string}>('select subject from emba_identity i where person_id=$1 and issuer=$2 and revoked_at is null and not exists(select 1 from emba_deletion_tombstone t where t.person_id=i.person_id)',[personId,issuer]);
 if(!identity)return null;
 const user=await (await clerkClient()).users.getUser(identity.subject).catch((error:unknown)=>{if((error as {status?:number})?.status===404)return null;throw error;});
 if(!user||user.banned||user.locked)return null;
 return user.emailAddresses.find(email=>email.id===user.primaryEmailAddressId&&email.verification?.status==='verified')?.emailAddress.trim().toLowerCase()??null;
}
/**
 * The verified primary address of each person who has one, by person, read from the sign-in provider in batches.
 * For the roster an owner or organizer sees; Loopd keeps no copy. A person the provider does not know is left out.
 */
export async function clerkEmailsOf(database:Db,personIds:string[]):Promise<Record<string,string>> {
 const issuer=clerkIssuer();
 if(!issuer||!clerkPortalConfigured()||!personIds.length)return {};
 const {rows}=await database.query<{personId:string;subject:string}>('select person_id as "personId",subject from emba_identity i where person_id=any($1::uuid[]) and issuer=$2 and revoked_at is null and not exists(select 1 from emba_deletion_tombstone t where t.person_id=i.person_id)',[personIds,issuer]);
 const client=await clerkClient(),found:Record<string,string>={};
 for(let at=0;at<rows.length;at+=100) {
  const part=rows.slice(at,at+100);
  const {data}=await client.users.getUserList({userId:part.map(row=>row.subject),limit:100});
  for(const user of data) {
   const email=user.emailAddresses.find(email=>email.id===user.primaryEmailAddressId&&email.verification?.status==='verified')?.emailAddress.trim().toLowerCase();
   const row=part.find(row=>row.subject===user.id);
   if(email&&row)found[row.personId]=email;
  }
 }
 return found;
}
export async function getClerkPortalPrincipal(database:Db):Promise<Principal|null> {
 return (await clerkSignIn(database))?.principal??null;
}
/**
 * Who is signed in with Clerk, and, when it was read on the way, whether they belong to any group (null when it was not).
 * A known account with nothing to write is identified by one statement and takes no lock: the locks below guard the
 * insert and the name, which that statement never makes. A new account, a revoked or deleted one, and one whose name the
 * provider has just given take the locked path, which refuses or enrols exactly as before.
 */
export async function clerkSignIn(database:Db):Promise<{principal:Principal;inAGroup:boolean|null}|null> {
 if(!clerkPortalConfigured()||(await headers()).has('authorization')) return null;
 const issuer=clerkIssuer()!;
 const session=await auth({acceptsToken:'session_token'});
 if(!session.isAuthenticated||session.tokenType!=='session_token'||!session.userId||!session.sessionId||session.actor) return null;
 const claims=session.sessionClaims;
 if(claims.iss!==issuer||claims.sub!==session.userId||!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now()) return null;
 const client=await clerkClient();
 const [user,active]=await Promise.all([currentUser(),client.sessions.getSession(session.sessionId)]);
 if(!user||user.id!==session.userId||user.banned||user.locked||active.id!==session.sessionId||active.userId!==user.id||active.status!=='active'||active.actor||active.expireAt<=Date.now()) return null;
 const email=user.emailAddresses.find(email=>email.id===user.primaryEmailAddressId&&email.verification?.status==='verified')?.emailAddress.trim().toLowerCase();
 if(!email) return null;
 const name=cleanName([user.firstName,user.lastName].filter(Boolean).join(' '));
 const verified=async()=>({issuer,subject:user.id,expiresAt:Math.min(claims.exp*1000,active.expireAt),authenticatedAt:verifiedAt(claims),verifiedEmail:email});
 // The same identity authenticate reads, with its person's name and whether they hold a live role in a group.
 const {rows:[known]}=await database.query<{person_id:string;name:string;inAGroup:boolean}>(
  `select i.person_id,p.name,exists(select 1 from emba_role r join emba_membership m on m.org_id=r.org_id and m.person_id=r.person_id
    where r.person_id=i.person_id and r.revoked_at is null and m.revoked_at is null) as "inAGroup"
   from emba_identity i join person p on p.id=i.person_id
   where i.issuer=$1 and i.subject=$2 and i.revoked_at is null and not exists(select 1 from emba_deletion_tombstone t where t.person_id=i.person_id)`,
  [issuer,user.id]);
 if(known&&!(known.name===UNNAMED&&name&&name!==UNNAMED)) {
  // authenticate asks for that row again; it is answered with the row just read, so no second statement is made.
  const read:Q={query:async()=>({rows:[{person_id:known.person_id}]}) as never};
  const principal=await authenticate(read,'verified-clerk-session',verified);
  return principal&&{principal,inAGroup:known.inAGroup};
 }
 const principal=await database.tx(async q=>{
  if(!await enrolClerkAccount(q,issuer,user.id,name)) return null;
  return authenticate(q,'verified-clerk-session',verified);
 });
 return principal&&{principal,inAGroup:null};
}
/**
 * The person for a sign-in account, made the first time the account is seen: at their first sign-in, or when an
 * organizer adds them to a group before it. Null when the account may not be used: its sign-in was revoked, or the
 * person deleted their data.
 */
export async function enrolClerkAccount(q:Q,issuer:string,subject:string,name:string|null):Promise<string|null> {
 await q.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([issuer,subject])]);
 const {rows:[existing]}=await q.query<{personId:string;revokedAt:string|null}>('select person_id as "personId",revoked_at as "revokedAt" from emba_identity where issuer=$1 and subject=$2',[issuer,subject]);
 if(existing?.revokedAt) return null;
 const id=existing?.personId??personId(issuer,subject);
 await q.query('select id from person where id=$1 for update',[id]);
 if((await q.query('select 1 from emba_deletion_tombstone where person_id=$1',[id])).rows.length) return null;
 if(!existing) {
  // Never associate by email/phone, enroll a group, or create a legacy session.
  const {rows}=await q.query('insert into person(id,phone,name,show_name,sms_opt_out) values($1,null,$2,false,true) on conflict do nothing returning id',[id,name??UNNAMED]);
  if(!rows.length) return null;
  await q.query('insert into emba_identity(issuer,subject,person_id,verified_at) values($1,$2,$3,now())',[issuer,subject,id]);
 }else if(await nameIfUnnamed(q,id,name)) {
  // Someone who joined before their name was known gets the tag they would have been given on joining.
  const {rows:orgs}=await q.query<{orgId:string}>('select org_id as "orgId" from emba_membership where person_id=$1 and revoked_at is null order by org_id',[id]);
  for(const {orgId} of orgs)await giveDefaultHandle(q,orgId,id);
 }
 return id;
}
/**
 * The sign-in account for an address, made if the provider has none, so a person can be in a group before they
 * first sign in. The provider sends them nothing. An address held unverified by some account is refused: whoever
 * typed it there has not shown it is theirs.
 */
export async function clerkAccountFor(email:string,name:string|null):Promise<string> {
 const client=await clerkClient();
 const {data}=await client.users.getUserList({emailAddress:[email],limit:10});
 const owner=data.find(user=>user.emailAddresses.some(address=>address.id===user.primaryEmailAddressId&&address.emailAddress.trim().toLowerCase()===email&&address.verification?.status==='verified'));
 if(owner)return owner.id;
 if(data.length)throw new Error('That address is on an account that has not verified it.');
 const [firstName,...rest]=(name??'').split(' ');
 return (await client.users.createUser({emailAddress:[email],firstName:firstName||undefined,lastName:rest.join(' ')||undefined,skipPasswordRequirement:true})).id;
}
