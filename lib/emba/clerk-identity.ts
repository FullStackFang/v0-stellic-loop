import 'server-only';
import {createHash} from 'node:crypto';
import {auth,clerkClient,currentUser} from '@clerk/nextjs/server';
import {headers} from 'next/headers';
import type {Db} from '../db';
import {authenticate,type Principal} from './access';

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
export async function getClerkPortalPrincipal(database:Db):Promise<Principal|null> {
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
 return database.tx(async q=>{
  await q.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([issuer,user.id])]);
  const {rows:[existing]}=await q.query<{personId:string;revokedAt:string|null}>('select person_id as "personId",revoked_at as "revokedAt" from emba_identity where issuer=$1 and subject=$2',[issuer,user.id]);
  if(existing?.revokedAt) return null;
  const id=existing?.personId??personId(issuer,user.id);
  await q.query('select id from person where id=$1 for update',[id]);
  if((await q.query('select 1 from emba_deletion_tombstone where person_id=$1',[id])).rows.length) return null;
  if(!existing) {
   // Never associate by email/phone, enroll a group, or create a legacy session.
   const {rows}=await q.query('insert into person(id,phone,name,show_name,sms_opt_out) values($1,null,$2,false,true) on conflict do nothing returning id',[id,'Member']);
   if(!rows.length) return null;
   await q.query('insert into emba_identity(issuer,subject,person_id,verified_at) values($1,$2,$3,now())',[issuer,user.id,id]);
  }
  return authenticate(q,'verified-clerk-session',async()=>({issuer,subject:user.id,expiresAt:Math.min(claims.exp*1000,active.expireAt),authenticatedAt:verifiedAt(claims),verifiedEmail:email}));
 });
}
