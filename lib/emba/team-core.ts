import 'server-only';
import {z,ZodError} from 'zod';
import type {Db,Q} from '../db';
import {canAccessLoop,type Principal} from './access';
import {audit,authorize,requireFirstParty} from './consent';
import {EmbaError} from './errors';
import {knownPeople,LIMITS,type PersonView} from './team-records';

// What team reads and the club writes (events, interest, asks) share: the one
// snapshot a read runs in, the one path a write takes, and how people are shown.

export type Scope={orgId:string;loopId:string};
export const scope={orgId:z.uuid(),loopId:z.uuid()};
export type TeamHead={handle:string;name:string};
export type Listed<T>={items:T[];more:number};

/**
 * A moment as a member or an assistant states it: with an offset
 * (2026-11-20T18:00:00-05:00, or ending in Z), or as local time in the team's
 * timezone (2026-11-20T18:00). The database turns it into an instant.
 */
export const moment=z.string().regex(/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?$/);
/** SQL for the instant of the moment in parameter `value`, read in the timezone in parameter `zone` when it carries no offset. */
export const instant=(value:number,zone:number)=>`(case when $${value}::text is null then null when $${value}::text ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then $${value}::text::timestamptz else $${value}::text::timestamp at time zone $${zone}::text end)`;
/** SQL for an instant as members read it: in the team's timezone, to the minute. */
export const local=(column:string,zone:string,year=true)=>`to_char(${column} at time zone ${zone},'Dy FMDD Mon${year?' YYYY':''}, HH24:MI')`;

/**
 * SQL that is true when `person` is a current member of the team who may post:
 * a live membership, sign-in and account, and a role of member or above on the
 * team or a group above it. `org` and `loop` are SQL expressions. The aliases
 * inside carry a prefix so that an expression such as `i.person_id` from the
 * caller's query keeps meaning the caller's table.
 */
export const posts=(person:string,org='$1',loop='$2')=>`(exists(select 1 from emba_membership posts_m where posts_m.org_id=${org} and posts_m.person_id=${person} and posts_m.revoked_at is null)
 and not exists(select 1 from emba_deletion_tombstone posts_t where posts_t.person_id=${person})
 and exists(select 1 from emba_identity posts_i where posts_i.person_id=${person} and posts_i.revoked_at is null)
 and exists(with recursive posts_up as (select id,parent_id from emba_loop where org_id=${org} and id=${loop} union all select posts_l.id,posts_l.parent_id from emba_loop posts_l join posts_up on posts_l.id=posts_up.parent_id where posts_l.org_id=${org})
  select 1 from posts_up join emba_role posts_r on posts_r.org_id=${org} and posts_r.loop_id=posts_up.id and posts_r.person_id=${person} and posts_r.revoked_at is null and posts_r.role in ('owner','organizer','member')))`;

export type Base={q:Q;lease:string|null;team:TeamHead;timezone:string;today:string;decisionSeq:number;changeSeq:number};
/** Every team read is one snapshot: a write that commits while it runs is either wholly in the answer or not at all. */
export async function reading<T>(db:Db,p:Principal,team:Scope,work:(base:Base)=>Promise<T>):Promise<T> {
 return db.tx(async q=>{
  await q.query('set transaction isolation level repeatable read');
  const lease=await authorize(q,p,'plan:read',team);
  // The team's name, its state and today's date in its timezone, in one statement of the snapshot.
  const {rows:[head]}=await q.query<{namespace:string;slug:string;root:boolean;name:string;timezone:string;decisionSeq:number;changeSeq:number;today:string}>(`select a.namespace,a.slug,l.parent_id is null as root,coalesce(l.name,o.name) as name,
    coalesce(s.timezone,'UTC') as timezone,coalesce(s.decision_seq,0) as "decisionSeq",coalesce(s.change_seq,0)::int as "changeSeq",
    to_char((clock_timestamp() at time zone coalesce(s.timezone,'UTC'))::date,'YYYY-MM-DD') as today
   from emba_group_address a join emba_loop l on l.org_id=a.org_id and l.id=a.loop_id join emba_organization o on o.id=a.org_id
   left join emba_team_state s on s.org_id=a.org_id and s.loop_id=a.loop_id
   where a.org_id=$1 and a.loop_id=$2 and a.retired_at is null`,[team.orgId,team.loopId]);
  if(!head)throw new EmbaError('forbidden');
  const value=await work({q,lease,team:{handle:head.root?`@${head.namespace}`:`@${head.namespace}/${head.slug}`,name:head.name},timezone:head.timezone,today:head.today,decisionSeq:head.decisionSeq,changeSeq:head.changeSeq});
  await audit(q,p,'plan:read',team.loopId,lease);
  return value;
 });
}

/** A person as shown inside a team. The site (never an assistant) also gets the name of a current member. */
export type Member=PersonView&{name?:string};
export async function viewMembers(q:Q,p:Principal,team:Scope,ids:(string|null)[]):Promise<(id:string|null)=>Member> {
 const people=await knownPeople(q,p,team,ids);
 return id=>{
  const view=people.view(id),name=view.former?null:people.name(id);
  return name?{...view,name}:view;
 };
}
/** A stable order that says nothing about who acted first. */
export const byName=(a:Member,b:Member)=>Number(b.isYou)-Number(a.isYou)||(a.name??a.handle??'~').localeCompare(b.name??b.handle??'~');

export type Refused=
 |{saved:false;reason:'busy'}
 |{saved:false;reason:'cap';cap:'writes_per_hour'}
 // The caller can read the team and may not do this: an event needs an owner or organizer, the rest need a member.
 |{saved:false;reason:'organizers_only'}
 |{saved:false;reason:'members_only'};
/** Thrown inside a write to save nothing and answer with a reason. */
export class Stop<R> extends Error {constructor(readonly result:R){super('declined');}}
export const stop=<R>(result:R):never=>{throw new Stop(result);};
export type WriteCtx={q:Q;p:Principal;team:Scope;timezone:string;
 /** Owner or organizer, on the site or through an assistant (design D6: events and asks only). */
 manager:boolean;
 /** Adds an entry to the team's change sequence. Needs the team's lock. */
 log:(action:string,target:{eventId:string}|{askId:string},actorId?:string|null)=>Promise<void>;
 /** The next number from the team's record counter. Needs the team's lock. */
 nextNumber:()=>Promise<number>};
type Options<T>={need:'post'|'manage';
 /** Take the team's lock: required to number an ask or to add to the change sequence. */
 lock?:boolean;
 siteOnly?:boolean;
 /** Allowed on a team whose address was retired. */
 retired?:boolean;
 /** Counts toward the limit of writes per hour. */
 count?:boolean;
 /** The answer when a unique name is already taken. */
 taken?:T};

/** Adds an entry about an event or an ask to the team's change sequence. The caller holds the team's lock. A null actor means Loop itself. */
export async function logChange(q:Q,team:Scope,action:string,target:{eventId:string}|{askId:string},actorId:string|null,clientId:string|null):Promise<void> {
 const {rows:[row]}=await q.query<{n:number}>('update emba_team_state set change_seq=change_seq+1 where org_id=$1 and loop_id=$2 returning change_seq::int as n',[team.orgId,team.loopId]);
 await q.query('insert into emba_team_change(org_id,loop_id,seq,event_id,ask_id,action,actor_id,client_id) values($1,$2,$3,$4,$5,$6,$7,$8)',
  [team.orgId,team.loopId,row.n,'eventId' in target?target.eventId:null,'askId' in target?target.askId:null,action,actorId,clientId]);
}

/** How many writes this person, through this assistant (or the site), made to the team in the last hour. */
export async function writesThisHour(q:Q,team:Scope,p:Principal):Promise<number> {
 const {rows:[row]}=await q.query<{count:number}>(`select ((select count(*) from emba_team_operation where org_id=$1 and loop_id=$2 and person_id=$3 and client_id is not distinct from $4 and at>clock_timestamp()-interval '1 hour')
  +(select count(*) from emba_team_conflict_report where org_id=$1 and loop_id=$2 and person_id=$3 and client_id is not distinct from $4 and at>clock_timestamp()-interval '1 hour')
  +(select count(*) from emba_team_write where org_id=$1 and loop_id=$2 and person_id=$3 and client_id is not distinct from $4 and at>clock_timestamp()-interval '1 hour'))::int as count`,[team.orgId,team.loopId,p.personId,p.clientId]);
 return row.count;
}

/**
 * The one path every event, interest and ask write takes. Order of locks, as
 * for team records (design D16 of loop-team-layer): the acting person, then
 * the team's state row when asked for, then the rows of the work itself.
 * Authority is checked before the work and again before commit. The work
 * either returns what was saved, or throws Stop to save nothing and say why.
 */
export async function teamWrite<T extends {saved:boolean}>(db:Db,p:Principal,team:Scope,options:Options<T>,work:(ctx:WriteCtx)=>Promise<T>):Promise<T|Refused> {
 try {
  return await db.tx(async q=>{
   await q.query("set local lock_timeout='2s'");
   if(p.clientId!==null&&!/^[ -~]{1,200}$/.test(p.clientId))throw new EmbaError('forbidden');
   await q.query('select id from person where id=$1 for no key update',[p.personId]);
   const authority=async()=>{
    if(options.siteOnly)await requireFirstParty(q,p);
    // An assistant needs a read-and-write grant for exactly this team. A write also answers with team data, so it needs read consent too.
    const lease=await authorize(q,p,'group-memory:write',team);
    await authorize(q,p,'plan:read',team);
    return {lease,post:await canAccessLoop(q,p,team.orgId,team.loopId,'post'),manage:await canAccessLoop(q,p,team.orgId,team.loopId,'manage')};
   };
   const first=await authority();
   const refusal=(held:{post:boolean;manage:boolean}):Refused|null=>options.need==='manage'&&!held.manage?{saved:false,reason:'organizers_only'}:held.post?null:{saved:false,reason:'members_only'};
   const refused=refusal(first);
   if(refused){await audit(q,p,'plan:read',team.loopId,first.lease);return refused;}
   const {rows:[address]}=await q.query(`select 1 from emba_group_address where org_id=$1 and loop_id=$2 and ($3::boolean or retired_at is null) for share`,[team.orgId,team.loopId,Boolean(options.retired)]);
   if(!address)throw new EmbaError('forbidden');
   if(options.lock){
    await q.query('insert into emba_team_state(org_id,loop_id) values($1,$2) on conflict do nothing',[team.orgId,team.loopId]);
    await q.query('select 1 from emba_team_state where org_id=$1 and loop_id=$2 for update',[team.orgId,team.loopId]);
   }
   const {rows:[state]}=await q.query<{timezone:string}>('select timezone from emba_team_state where org_id=$1 and loop_id=$2',[team.orgId,team.loopId]);
   if(options.count&&await writesThisHour(q,team,p)>=LIMITS.writesPerHour){await audit(q,p,'plan:read',team.loopId,first.lease);return {saved:false,reason:'cap',cap:'writes_per_hour'};}
   const locked=()=>{if(!options.lock)throw new Error('The team lock is not held');};
   const ctx:WriteCtx={q,p,team,timezone:state?.timezone??'UTC',manager:first.manage,
    log:async(action,target,actorId=p.personId)=>{locked();await logChange(q,team,action,target,actorId,actorId===null?null:p.clientId);},
    nextNumber:async()=>{
     locked();
     const {rows:[row]}=await q.query<{n:number}>('update emba_team_state set record_seq=record_seq+1 where org_id=$1 and loop_id=$2 returning record_seq as n',[team.orgId,team.loopId]);
     return row.n;
    }};
   // A declined write undoes everything the work had already done.
   let result:T;
   await q.query('savepoint club_work');
   try{result=await work(ctx);}
   catch(error){if(!(error instanceof Stop))throw error;await q.query('rollback to savepoint club_work');result=error.result as T;}
   // Authority is checked again inside the transaction, so a grant or a role removed a moment ago is not used.
   const final=await authority();
   if(refusal(final))throw new EmbaError('forbidden');
   if(result.saved&&options.count)await q.query('insert into emba_team_write(org_id,loop_id,person_id,client_id) values($1,$2,$3,$4)',[team.orgId,team.loopId,p.personId,p.clientId]);
   // A declined write may have shown team data; that is a read, and is recorded as one.
   await audit(q,p,result.saved?'activity:write':'plan:read',team.loopId,final.lease);
   return result;
  });
 }catch(error){
  const code=typeof error==='object'&&error!==null&&'code' in error?error.code:null;
  // The lock wait ran out, or the database stopped this write to let another finish. Nothing was saved either way.
  if(code==='55P03'||code==='40P01'||code==='40001')return {saved:false,reason:'busy'};
  if(code==='23505'&&options.taken)return options.taken;
  // A database rule refused the content. Its message quotes the row, so it is replaced by a plain invalid-input error.
  if(code==='23514'||(typeof code==='string'&&code.startsWith('22')))throw new ZodError([]);
  throw error;
 }
}
