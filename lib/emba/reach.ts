import 'server-only';
import {z} from 'zod';
import type {Db,Q} from '../db';
import {canAccessLoop,type Principal} from './access';
import {audit,requireFirstParty} from './consent';
import {EmbaError} from './errors';
import {listPortalGroups} from './groups';
import {belongsTo,scope,type Scope} from './team-core';

// How each team may reach a member (design D3 of loop-club-reach). One choice
// per member per team: only in their assistant and on the site, by email, by
// WhatsApp, or not at all. With no choice saved the default applies: email,
// for asks and the announcements an organizer chooses to send. Whatever the
// choice, everything stays visible on the site and through the assistant.
// A choice is set on the site only, never through an assistant.

export const WAYS=['assistant','email','whatsapp','none'] as const;
export type Way=typeof WAYS[number];
export const DEFAULT_WAY:Way='email';
/** WhatsApp is offered only once the operator has set up Loop's own number. */
export const whatsappConfigured=(env:Record<string,string|undefined>=process.env)=>Boolean(env.WHATSAPP_NUMBER&&env.WHATSAPP_PHONE_NUMBER_ID&&env.WHATSAPP_ACCESS_TOKEN&&env.WHATSAPP_APP_SECRET);

export type ReachChoice={way:Way;
 /** No choice was saved: the default applies. */
 isDefault:boolean;
 /** off: the operator has not set WhatsApp up. not_linked: the member has yet to message Loop's number. */
 whatsapp:'off'|'not_linked'|'linked'};

/** SQL: the way a team reaches a person, the default when they saved none. */
export const waySql=(org:string,loop:string,person:string)=>`coalesce((select c.way from emba_reach_choice c where c.org_id=${org} and c.loop_id=${loop} and c.person_id=${person}),'${DEFAULT_WAY}')`;

const linked=async(q:Q,personId:string)=>(await q.query('select 1 from emba_whatsapp_number where person_id=$1 and stopped_at is null',[personId])).rows.length>0;
const whatsappState=async(q:Q,personId:string):Promise<ReachChoice['whatsapp']>=>!whatsappConfigured()?'off':await linked(q,personId)?'linked':'not_linked';
/** A member or follower of the team, or someone whose request to join it is waiting: the join page lets a person choose before they are in. */
async function mayChoose(q:Q,p:Principal,team:Scope):Promise<void> {
 await requireFirstParty(q,p);
 if(await canAccessLoop(q,p,team.orgId,team.loopId,'read'))return;
 const {rows}=await q.query("select 1 from emba_group_membership_request where org_id=$1 and loop_id=$2 and person_id=$3 and state='pending'",[team.orgId,team.loopId,p.personId]);
 if(!rows.length)throw new EmbaError('forbidden');
}

/** Site only: how this team reaches the caller. */
export async function reachChoice(db:Db,p:Principal,input:unknown):Promise<ReachChoice> {
 const team=z.strictObject(scope).parse(input);
 return db.tx(async q=>{
  await mayChoose(q,p,team);
  const {rows:[row]}=await q.query<{way:Way}>('select way from emba_reach_choice where org_id=$1 and loop_id=$2 and person_id=$3',[team.orgId,team.loopId,p.personId]);
  return {way:row?.way??DEFAULT_WAY,isDefault:!row,whatsapp:await whatsappState(q,p.personId)};
 });
}

export type ReachWrite={saved:true;way:Way}|{saved:false;reason:'whatsapp_off'|'whatsapp_not_linked'};
/**
 * Site only: the caller chooses how one team reaches them. It takes effect
 * for the next message. WhatsApp can be chosen only after the member's own
 * message to Loop's number has linked their number.
 */
export async function setReachChoice(db:Db,p:Principal,input:unknown):Promise<ReachWrite> {
 const {way,...team}=z.strictObject({...scope,way:z.enum(WAYS)}).parse(input);
 return db.tx(async q=>{
  await mayChoose(q,p,team);
  if(way==='whatsapp'){
   const state=await whatsappState(q,p.personId);
   if(state!=='linked')return {saved:false as const,reason:state==='off'?'whatsapp_off' as const:'whatsapp_not_linked' as const};
  }
  const {rows}=await q.query('select 1 from emba_group_address where org_id=$1 and loop_id=$2 and retired_at is null for share',[team.orgId,team.loopId]);
  if(!rows.length)throw new EmbaError('forbidden');
  await q.query('insert into emba_reach_choice(org_id,loop_id,person_id,way) values($1,$2,$3,$4) on conflict(org_id,loop_id,person_id) do update set way=excluded.way,at=clock_timestamp()',[team.orgId,team.loopId,p.personId,way]);
  await audit(q,p,'activity:write',team.loopId);
  return {saved:true as const,way};
 });
}

export type ReachRow={orgId:string;loopId:string;handle:string;name:string;way:Way;isDefault:boolean};
/** Site only: the caller's choice for every team they belong to, for the preferences page. */
export async function listReachChoices(db:Db,p:Principal):Promise<{email:string|null;whatsapp:ReachChoice['whatsapp'];teams:ReachRow[]}> {
 const groups=await listPortalGroups(db,p);
 return db.tx(async q=>{
  await requireFirstParty(q,p);
  const {rows}=await q.query<{loopId:string;way:Way}>('select loop_id as "loopId",way from emba_reach_choice where person_id=$1',[p.personId]);
  const saved=new Map(rows.map(row=>[row.loopId,row.way]));
  return {email:p.verifiedEmail,whatsapp:await whatsappState(q,p.personId),
   teams:groups.map(group=>({orgId:group.orgId,loopId:group.loopId,handle:group.loopPath.includes('/')?group.handle:`@${group.namespace}`,name:group.orgName,way:saved.get(group.loopId)??DEFAULT_WAY,isDefault:!saved.has(group.loopId)}))};
 });
}

const stopToken=z.string().regex(/^[0-9a-f]{32}$/);
const stopTarget=`select g.org_id as "orgId",g.loop_id as "loopId",g.person_id as "personId",coalesce(l.name,o.name) as "group" from emba_reach_message g
 join emba_loop l on l.org_id=g.org_id and l.id=g.loop_id join emba_organization o on o.id=g.org_id where g.stop_token=$1`;
type Stop={orgId:string;loopId:string;personId:string;group:string};
/** The page behind a stop link, before anything is done: the team it would stop. It writes nothing, because mail scanners and chat previews open links. */
export async function stopLinkPreview(db:Db,token:string):Promise<{group:string}|null> {
 if(!stopToken.safeParse(token).success)return null;
 const {rows:[row]}=await db.query<Stop>(stopTarget,[token]);
 return row?{group:row.group}:null;
}
/**
 * The stop link's one action, with no sign-in: the team that sent the message
 * sends this member nothing further. It changes no other team's choice, opens
 * no session and shows nothing but the team's name. Messages already queued
 * for the member in that team are not sent.
 */
export async function stopFromLink(db:Db,token:string):Promise<{group:string}|null> {
 if(!stopToken.safeParse(token).success)return null;
 return db.tx(async q=>{
  const {rows:[row]}=await q.query<Stop>(stopTarget,[token]);
  if(!row)return null;
  // A choice belongs to a membership: someone who has left has none to change, and must not find one waiting if they join again.
  await q.query(`insert into emba_reach_choice(org_id,loop_id,person_id,way) select $1::uuid,$2::uuid,$3::uuid,'none' where ${belongsTo('$3::uuid','$1::uuid','$2::uuid')}
   on conflict(org_id,loop_id,person_id) do update set way='none',at=clock_timestamp()`,[row.orgId,row.loopId,row.personId]);
  await q.query("update emba_reach_message set state='skipped' where org_id=$1 and loop_id=$2 and person_id=$3 and state='queued'",[row.orgId,row.loopId,row.personId]);
  return {group:row.group};
 });
}
