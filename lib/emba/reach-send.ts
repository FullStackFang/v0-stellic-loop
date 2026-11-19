import 'server-only';
import type {Db,Q} from '../db';
import {memberInviteIcs} from '../ics';
import {appUrl} from '../url';
import {groupPath} from './group-path';
import {waySql,type Way} from './reach';
import {calendarUid,inviteSender} from './team-calendar';
import {belongsTo,local,posts,type Scope} from './team-core';

// What Loop sends, and when (design D4 of loop-club-reach, D5 of loop-trip).
// Six kinds of message only: a new ask, one reminder per ask, an announcement
// an organizer chose to send, an ask's result to the person who asked, and a
// calendar invite for a plan or its cancellation. Each is one row
// of emba_reach_message, written when it becomes due and sent by the
// scheduled run. Everything that decides whether a row is sent is read again
// at the moment of sending: the member's choice for the team, their
// membership, whether the ask is still open and whether they have answered.

export const SENDING={
 /** Messages one team may send one member in a day, and all teams together. */
 perTeamDay:3,perDay:10,
 /** No message goes out from this hour until `quietTo`, in the team's timezone. */
 quietFrom:21,quietTo:8,
 /** A send the provider refused for now is tried again on later runs, this many times in all. */
 attempts:5,
 /** Rows looked at in one run. */
 batch:60,
 /** An ask's result is sent to the asker only if the ask ended this recently. */
 resultHours:24,
 /** A reminder is not sent within this many hours of the new-ask message for the same ask. */
 reminderGapHours:3,
 /** How long a run may hold a row it is sending before another run may take it. */
 claimMinutes:10,
 /** A run stops taking rows after this long; the scheduled route is cut off at 60 seconds. */
 budgetMs:45_000} as const;
/** The one switch. Off until the operator sets it: nothing is queued and nothing is sent. */
export const sendingOn=(env:Record<string,string|undefined>=process.env)=>env.LOOP_REACH_SENDING==='on';

type Kind='ask_new'|'ask_reminder'|'ask_result'|'announcement'|'invite'|'invite_cancel';
const calendarKind=(kind:Kind)=>kind==='invite'||kind==='invite_cancel';
const ROLES_ALL="'owner','organizer','member','follower'";

/** In the ask's own transaction: a new-ask message for every member who can answer, except the person who asked. */
export async function queueAsk(q:Q,team:Scope,askId:string,askerId:string):Promise<void> {
 if(!sendingOn())return;
 await q.query(`insert into emba_reach_message(org_id,loop_id,person_id,kind,ask_id)
  select $1,$2,m.person_id,'ask_new',$3::uuid from emba_membership m where m.org_id=$1 and m.revoked_at is null and m.person_id<>$4::uuid and ${posts('m.person_id')} on conflict do nothing`,[team.orgId,team.loopId,askId,askerId]);
}
/** In the transaction that opens the ask for an idea's day: a new-ask message for every member who is in on the idea, its proposer among them. */
export async function queueDayAsk(q:Q,team:Scope,askId:string,eventId:string):Promise<void> {
 if(!sendingOn())return;
 await q.query(`insert into emba_reach_message(org_id,loop_id,person_id,kind,ask_id)
  select $1,$2,i.person_id,'ask_new',$3::uuid from emba_event_interest i where i.event_id=$4 and ${posts('i.person_id')} on conflict do nothing`,[team.orgId,team.loopId,askId,eventId]);
}
/** In the announcement's own transaction, when the organizer chose to send it: a message for everyone who belongs to the team, except its author. */
export async function queueAnnouncement(q:Q,team:Scope,recordId:string,authorId:string):Promise<void> {
 if(!sendingOn())return;
 await q.query(`insert into emba_reach_message(org_id,loop_id,person_id,kind,record_id)
  select $1,$2,m.person_id,'announcement',$3::uuid from emba_membership m where m.org_id=$1 and m.revoked_at is null and m.person_id<>$4::uuid and ${posts('m.person_id','$1','$2',ROLES_ALL)} on conflict do nothing`,[team.orgId,team.loopId,recordId,authorId]);
}

/** When an ask's reminder is due: 24 hours before it closes, or halfway to closing when it runs under 48 hours. Worked out from the ask on every run, so a late run sends late and never twice. */
export const reminderDueSql=(k='k')=>`(case when ${k}.closes_at-${k}.created_at>=interval '48 hours' then ${k}.closes_at-interval '24 hours' else ${k}.created_at+(${k}.closes_at-${k}.created_at)/2 end)`;
/**
 * A reminder or result that already went out for an ask is sent once more
 * after the ask was given a new closing time (loop-on-you, design D3). The row
 * is used again, so the links in the earlier message keep working. `before` is
 * the moment the earlier row must predate.
 */
const again=(before:string)=>`on conflict(person_id,ask_id,kind) where ask_id is not null do update set state='queued',way=null,sent_at=null,claimed_at=null,attempts=0,provider_id=null,created_at=clock_timestamp()
  where emba_reach_message.state<>'queued' and emba_reach_message.created_at<${before}`;
const lastMoved="(select max(c.at) from emba_team_change c where c.ask_id=excluded.ask_id and c.action='ask_extended')";
/** Writes the rows that have become due since the last run. One row per member and ask and kind for each closing time the ask has had, whatever the number of runs. */
async function queueDue(db:Db):Promise<void> {
 // A reminder: the ask is open, its reminder time has come, and the member can answer and has not.
 await db.query(`insert into emba_reach_message(org_id,loop_id,person_id,kind,ask_id)
  select k.org_id,k.loop_id,m.person_id,'ask_reminder',k.id from emba_ask k join emba_membership m on m.org_id=k.org_id and m.revoked_at is null
   join emba_group_address d on d.org_id=k.org_id and d.loop_id=k.loop_id and d.retired_at is null
  where k.closed_at is null and k.closes_at>clock_timestamp() and clock_timestamp()>=${reminderDueSql()} and (case when k.only_in then exists(select 1 from emba_event_interest i where i.event_id=k.event_id and i.person_id=m.person_id) else m.person_id is distinct from k.asker_id end)
   and not exists(select 1 from emba_ask_answer a where a.ask_id=k.id and a.person_id=m.person_id) and ${posts('m.person_id','k.org_id','k.loop_id')}
   -- Not on the heels of the ask itself: its own message must have gone, and not in the last few hours.
   and not exists(select 1 from emba_reach_message n where n.ask_id=k.id and n.person_id=m.person_id and n.kind='ask_new' and (n.state='queued' or n.sent_at>clock_timestamp()-interval '${SENDING.reminderGapHours} hours'))
  ${again(lastMoved)}`);
 // The result, to the person who asked, once the ask has ended.
 await db.query(`insert into emba_reach_message(org_id,loop_id,person_id,kind,ask_id)
  select k.org_id,k.loop_id,k.asker_id,'ask_result',k.id from emba_ask k join emba_group_address d on d.org_id=k.org_id and d.loop_id=k.loop_id and d.retired_at is null
  where k.asker_id is not null and coalesce(k.closed_at,k.closes_at)<=clock_timestamp() and coalesce(k.closed_at,k.closes_at)>clock_timestamp()-interval '${SENDING.resultHours} hours'
   and ${posts('k.asker_id','k.org_id','k.loop_id')} ${again("(select coalesce(k.closed_at,k.closes_at) from emba_ask k where k.id=excluded.ask_id)")}`);
}

/** One message, as the templates see it. It names the group, the item and the person who asked or announced, and nobody else. */
export type Outgoing={id:string;kind:Kind;group:string;
 /** The person who asked or announced. */
 from:string|null;
 /** The question, or the announcement's text. */
 text:string;
 /** When the ask closes or closed, in the team's timezone. */
 closes:string|null;timezone:string;
 /** The personal answer link (a new ask or a reminder), else the page to read the item on. */
 link:string;stopLink:string;
 /** The ask is something to do (loop-on-you): the words say done, not answered. */
 todo?:boolean;
 /** A calendar invite or its cancellation: when and where, and whether this member already holds the entry. `text` is the event's name. */
 event?:{when:string;place:string|null;update:boolean}};
export type Email={subject:string;text:string;html:string};
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
/** The email for a message: a plain-text part and the same words as HTML, one link to act and one to stop. */
export function renderEmail(m:Outgoing):Email {
 const who=m.from??'A member',closes=m.closes?`${m.closes} (${m.timezone})`:'';
 const [subject,lead,action]=m.kind==='invite'?[`${m.group}: ${m.text}`,m.event?.update?`${m.group}: the time or place of this has changed.`:`${m.group}: you are in on this. The calendar entry is attached.`,'Open in Loop']
  :m.kind==='invite_cancel'?[`Off your calendar · ${m.group}: ${m.text}`,`${m.group}: this is off your calendar.`,'Open in Loop']
  :m.todo&&m.kind==='ask_new'?[`To do · ${m.group}: ${m.text}`,`${who} asked ${m.group} to do this:`,'Mark it done']
  :m.todo&&m.kind==='ask_reminder'?[`Reminder · ${m.group}: ${m.text}`,`${who} asked ${m.group} to do this, and you have not done it yet:`,'Mark it done']
  :m.todo&&m.kind==='ask_result'?[`Passed · ${m.group}: ${m.text}`,`What you asked ${m.group} to do has passed its time:`,'See who did it']
  :m.kind==='ask_new'?[`${m.group}: ${m.text}`,`${who} asked ${m.group}:`,'Answer']
  :m.kind==='ask_reminder'?[`Reminder · ${m.group}: ${m.text}`,`${who} asked ${m.group}, and you have not answered yet:`,'Answer']
  :m.kind==='ask_result'?[`Closed · ${m.group}: ${m.text}`,`Your question to ${m.group} has closed:`,'See the answers']
  :[`${m.group}: announcement`,`${who} announced to ${m.group}:`,'Open in Loop'];
 const when=m.event?[`${m.event.when} (${m.timezone})`,m.event.place].filter(Boolean).join(' · '):m.kind==='ask_result'||!closes?'':`${m.todo?'Due':'Closes'} ${closes}.`;
 const stop=`Stop messages from ${m.group}`;
 const text=[lead,m.text,when,`${action}: ${m.link}`,`${stop}: ${m.stopLink}`].filter(Boolean).join('\n\n');
 const html=`<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a"><p>${escape(lead)}</p><p style="font-size:18px"><strong>${escape(m.text)}</strong></p>${when?`<p>${escape(when)}</p>`:''}<p><a href="${escape(m.link)}">${escape(action)}</a></p><p style="font-size:13px;color:#666"><a href="${escape(m.stopLink)}" style="color:#666">${escape(stop)}</a></p></body></html>`;
 return {subject,text,html};
}

export type SendResult={ok:true;providerId:string|null}|{ok:false;
 /** The provider may take it later. */
 retry:boolean};
/** How messages leave. The scheduled route supplies the real ones; tests supply their own. */
export type Carrier={
 /** The member's verified sign-in address, read when the message is sent. Loop keeps no copy of it. */
 address:(personId:string)=>Promise<string|null>;
 /** `id` is the message's own id: the provider is asked to treat a repeat of it as the same send. */
 email:(message:{id:string;to:string;stopLink:string;
  /** For the List-Unsubscribe header, with List-Unsubscribe-Post: a POST to it stops the group in one step. */
  unsubscribeUrl:string;
  /** A calendar invite or cancellation: sent as a text/calendar part with this method, so the member's calendar takes it. */
  calendar?:{method:'REQUEST'|'CANCEL';content:string}}&Email)=>Promise<SendResult>};

type Row={id:string;kind:Kind;personId:string;attempts:number;way:Way;group:string;timezone:string;hour:number;belongs:boolean;canAnswer:boolean;
 askOpen:boolean|null;answered:boolean|null;closes:string|null;question:string|null;askKind:string|null;asker:string|null;shareToken:string|null;answerToken:string;stopToken:string;
 body:string|null;recordLive:boolean|null;author:string|null;
 /** Null when the group's address has been retired: nothing is sent for a group that is gone. */
 namespace:string|null;slug:string|null;sentTeam:number;sentAll:number;
 /** A calendar invite or cancellation: the version it carries and the event as it stands now. */
 sequence:number|null;eventName:string|null;eventStartsAt:string|null;eventEndsAt:string|null;eventStarts:string|null;eventPlace:string|null;eventToken:string|null;
 /** The event is a fixed event or a plan, not archived, with a start, and has not ended. */
 eventLive:boolean|null;
 /** Its time has passed: nothing is left to take out of a calendar. */
 eventOver:boolean|null;isIn:boolean;
 /** A later version for this member and event exists: this one is out of date. */
 newer:boolean;
 /** An invite for this event was sent to this member before this row. */
 invited:boolean};
const today="date_trunc('day',clock_timestamp() at time zone coalesce(s.timezone,'UTC')) at time zone coalesce(s.timezone,'UTC')";
/** A row no run is sending right now. A claim lapses, so a run that died mid-send does not hold its row for ever. */
const free=(g='g')=>`(${g}.state='queued' and (${g}.claimed_at is null or ${g}.claimed_at<=clock_timestamp()-interval '${SENDING.claimMinutes} minutes'))`;
/** Counts against the day's limits: sent today, or being sent at this moment by another run. */
const counted=`((x.state='sent' and x.sent_at>=${today}) or (x.state='queued' and x.claimed_at>clock_timestamp()-interval '${SENDING.claimMinutes} minutes'))`;
const quiet=(()=>{const hour="extract(hour from clock_timestamp() at time zone coalesce(s.timezone,'UTC'))::int";return `(${hour}>=${SENDING.quietFrom} or ${hour}<${SENDING.quietTo})`;})();
// Built when first used, not when this file loads: the team modules import one another.
const rowSql=()=>`select g.id,g.kind,g.person_id as "personId",g.attempts,${waySql('g.org_id','g.loop_id','g.person_id')} as way,coalesce(l.name,o.name) as "group",coalesce(s.timezone,'UTC') as timezone,
  extract(hour from clock_timestamp() at time zone coalesce(s.timezone,'UTC'))::int as hour,
  ${belongsTo('g.person_id','g.org_id','g.loop_id')} as belongs,(${posts('g.person_id','g.org_id','g.loop_id')} and (k.only_in is not true or exists(select 1 from emba_event_interest i where i.event_id=k.event_id and i.person_id=g.person_id))) as "canAnswer",
  (k.closed_at is null and k.closes_at>clock_timestamp()) as "askOpen",exists(select 1 from emba_ask_answer a where a.ask_id=k.id and a.person_id=g.person_id) as answered,
  ${local('coalesce(k.closed_at,k.closes_at)',"coalesce(s.timezone,'UTC')")} as closes,k.question,k.kind as "askKind",(select p.name from person p where p.id=k.asker_id) as asker,k.share_token as "shareToken",
  g.answer_token as "answerToken",g.stop_token as "stopToken",
  (select v.body from emba_team_record_version v where v.record_id=r.id and v.version=r.current_version) as body,r.state='current' as "recordLive",(select p.name from person p where p.id=r.author_id) as author,
  d.namespace,d.slug,
  g.sequence,e.name as "eventName",e.starts_at as "eventStartsAt",e.ends_at as "eventEndsAt",${local('e.starts_at',"coalesce(s.timezone,'UTC')")} as "eventStarts",e.place as "eventPlace",e.share_token as "eventToken",
  (e.archived_at is null and e.state in ('fixed','planned') and e.starts_at is not null and coalesce(e.ends_at,e.starts_at)>clock_timestamp()) as "eventLive",
  coalesce(e.ends_at,e.starts_at)<=clock_timestamp() as "eventOver",
  exists(select 1 from emba_event_interest i where i.event_id=g.event_id and i.person_id=g.person_id) as "isIn",
  exists(select 1 from emba_reach_message n where n.person_id=g.person_id and n.event_id=g.event_id and n.sequence>g.sequence) as newer,
  exists(select 1 from emba_reach_message n where n.person_id=g.person_id and n.event_id=g.event_id and n.kind='invite' and n.state='sent' and n.sequence<g.sequence) as invited,
  (select count(*)::int from emba_reach_message x where x.person_id=g.person_id and x.org_id=g.org_id and x.loop_id=g.loop_id and ${counted}) as "sentTeam",
  (select count(*)::int from emba_reach_message x where x.person_id=g.person_id and ${counted}) as "sentAll"
 from emba_reach_message g join emba_loop l on l.org_id=g.org_id and l.id=g.loop_id join emba_organization o on o.id=g.org_id
  left join emba_group_address d on d.org_id=g.org_id and d.loop_id=g.loop_id and d.retired_at is null
  left join emba_team_state s on s.org_id=g.org_id and s.loop_id=g.loop_id left join emba_ask k on k.id=g.ask_id left join emba_team_record r on r.id=g.record_id left join emba_team_event e on e.id=g.event_id
 where g.id=$1 and ${free()} for update of g skip locked`;

/** Why a queued row is not sent now, or null when it should be. `wait` leaves it queued for a later run. */
function verdict(row:Row):'skipped'|'held'|'wait'|null {
 if(!row.namespace||!row.belongs||row.way==='none'||row.way==='assistant')return 'skipped';
 // An invite goes to a member who is still in on an event that still stands; a cancellation only to a calendar that got the invite.
 // Either is dropped when a later version for the same member exists: that one says what is true now.
 if(row.kind==='invite'){if(row.newer||!row.isIn||!row.canAnswer||!row.eventLive)return 'skipped';}
 else if(row.kind==='invite_cancel'){if(row.newer||!row.invited||row.eventOver)return 'skipped';}
 else if(row.kind==='announcement'){if(!row.recordLive)return 'skipped';}
 else if(!row.canAnswer)return 'skipped';
 else if(row.kind!=='ask_result'&&(!row.askOpen||row.answered))return 'skipped';
 // The ask was opened again before its result went out: the result follows when it closes again.
 else if(row.kind==='ask_result'&&row.askOpen)return 'skipped';
 if(row.hour>=SENDING.quietFrom||row.hour<SENDING.quietTo)return 'wait';
 // The day's limits are for messages that ask for attention. A calendar entry follows the member's own "I'm in": held back a day, it could arrive after the plan.
 if(!calendarKind(row.kind)&&(row.sentTeam>=SENDING.perTeamDay||row.sentAll>=SENDING.perDay))return 'held';
 return null;
}
const outgoing=(row:Row):Outgoing=>{
 const team=`${groupPath(row.namespace!,row.slug)}/team`;
 if(calendarKind(row.kind))return {id:row.id,kind:row.kind,group:row.group,from:null,text:row.eventName??'',closes:null,timezone:row.timezone,
  link:appUrl(row.kind==='invite'?`/e/${row.eventToken}`:team),stopLink:appUrl(`/groups/reach/stop/${row.stopToken}`),event:{when:row.eventStarts??'No date',place:row.eventPlace,update:row.kind==='invite'&&row.invited}};
 return {id:row.id,kind:row.kind,group:row.group,from:row.kind==='announcement'?row.author:row.asker,text:(row.kind==='announcement'?row.body:row.question)??'',closes:row.kind==='announcement'?null:row.closes,timezone:row.timezone,...(row.askKind==='done'?{todo:true}:{}),
  link:appUrl(row.kind==='announcement'?team:row.kind==='ask_result'?`/a/${row.shareToken}`:`/groups/reach/answer/${row.answerToken}`),stopLink:appUrl(`/groups/reach/stop/${row.stopToken}`)};
};

export type DrainResult={on:boolean;sent:number;skipped:number;held:number;waiting:number;retrying:number;failed:number};
type Outcome=Exclude<keyof DrainResult,'on'>;
/**
 * The scheduled run: writes the rows that have become due, then sends what is
 * queued. A row is decided and claimed in one short transaction, sent with no
 * transaction open, and marked afterwards. The claim counts the attempt before
 * the provider is called, so a run that dies after the provider accepted
 * cannot send that row more than the allowed number of times, and two runs at
 * once never send the same row. One row that fails does not stop the others.
 */
export async function drainReach(db:Db,carrier:Carrier):Promise<DrainResult> {
 const result:DrainResult={on:sendingOn(),sent:0,skipped:0,held:0,waiting:0,retrying:0,failed:0};
 if(!result.on)return result;
 const stopAt=Date.now()+SENDING.budgetMs;
 await queueDue(db);
 // Rows of a team that is in its quiet hours are counted and left, so they do not stand in front of other teams' rows.
 const from='from emba_reach_message g left join emba_team_state s on s.org_id=g.org_id and s.loop_id=g.loop_id';
 const {rows:[held]}=await db.query<{n:number}>(`select count(*)::int as n ${from} where ${free()} and ${quiet}`);
 result.waiting=held.n;
 const {rows}=await db.query<{id:string}>(`select g.id ${from} where ${free()} and not ${quiet} order by g.created_at,g.id limit $1`,[SENDING.batch]);
 const finish=(id:string,sql:string,values:unknown[]=[])=>db.query(`update emba_reach_message set ${sql} where id=$1`,[id,...values]);
 /** Decides the row and, if it is to be sent, claims it. */
 const claim=(id:string)=>db.tx(async(q):Promise<Outcome|Row|null>=>{
  // One member's rows are decided one at a time, so two runs cannot both count the day's messages before either sends.
  await q.query('select 1 from person where id=(select person_id from emba_reach_message where id=$1) for update',[id]);
  const {rows:[row]}=await q.query<Row>(rowSql(),[id]);
  if(!row)return null;
  const set=async(state:Outcome)=>{await q.query('update emba_reach_message set state=$2,claimed_at=null where id=$1',[id,state]);return state;};
  const why=verdict(row);
  if(why==='wait')return 'waiting';
  if(why)return set(why);
  // WhatsApp is sent by its own carrier (section 7). Until it exists, a member who chose it is sent nothing by email in its place.
  if(row.way!=='email')return set('skipped');
  if(row.attempts>=SENDING.attempts)return set('failed');
  await q.query('update emba_reach_message set claimed_at=clock_timestamp(),attempts=attempts+1 where id=$1',[id]);
  return row;
 });
 async function send(row:Row):Promise<Outcome> {
  const again=async():Promise<Outcome>=>{
   if(row.attempts+1>=SENDING.attempts){await finish(row.id,"state='failed',claimed_at=null");return 'failed';}
   await finish(row.id,'claimed_at=null');return 'retrying';
  };
  let to:string|null;
  // The sign-in provider could not be asked: try again later. It answered that there is no verified address: that is final.
  try{to=await carrier.address(row.personId);}catch{return again();}
  if(!to){await finish(row.id,"state='failed',claimed_at=null");return 'failed';}
  const message=outgoing(row);
  // The calendar file names Loop's sending address and this one member, and nobody else.
  const calendar=calendarKind(row.kind)?{method:row.kind==='invite'?'REQUEST' as const:'CANCEL' as const,content:memberInviteIcs({method:row.kind==='invite'?'REQUEST':'CANCEL',organizer:inviteSender(),attendee:to,
   entry:{uid:calendarUid(row.eventToken!),sequence:row.sequence??0,start:row.eventStartsAt?new Date(row.eventStartsAt):new Date(),end:row.eventEndsAt?new Date(row.eventEndsAt):null,summary:row.eventName??'',location:row.eventPlace,description:row.group,url:row.kind==='invite'?message.link:null}})}:undefined;
  const sent=await carrier.email({id:row.id,to,stopLink:message.stopLink,unsubscribeUrl:appUrl(`/api/reach/stop/${row.stopToken}`),...(calendar?{calendar}:{}),...renderEmail(message)}).catch(()=>({ok:false as const,retry:true}));
  if(sent.ok){
   // Whatever the provider calls its id, a value the column would refuse must not undo the record of a send that happened.
   const providerId=sent.providerId&&/^[ -~]{1,200}$/.test(sent.providerId)?sent.providerId:null;
   await finish(row.id,"state='sent',way='email',sent_at=clock_timestamp(),claimed_at=null,provider_id=$2",[providerId]);
   return 'sent';
  }
  if(!sent.retry){await finish(row.id,"state='failed',claimed_at=null");return 'failed';}
  return again();
 }
 for(const {id} of rows){
  // The run must end well inside its time limit: what is left goes out on the next run.
  if(Date.now()>stopAt)break;
  try{
   const claimed=await claim(id);
   if(claimed===null)continue;
   const outcome=typeof claimed==='string'?claimed:await send(claimed);
   result[outcome]++;
  }catch{result.retrying++;}
 }
 return result;
}
