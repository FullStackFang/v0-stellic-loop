import 'server-only';
import {z} from 'zod';
import type {Db,Q} from '../db';
import {appUrl} from '../url';
import {canAccessLoop,type Principal} from './access';
import {EmbaError} from './errors';
import {byName,instant,local,logChange,moment,posts,reading,scope,stop,teamWrite,viewMembers,type Listed,type Member,type Refused,type Scope,type TeamHead,type WriteCtx} from './team-core';
import {arrival,route,type JoinStep} from './team-interest';
import {lineSchema,nameSchema} from './team-text';

// Asks (design D3, D4, D5, D7 of loop-club-events-and-asks). A member asks the
// team one question with a closing time; each member answers once and may
// change the answer until it closes. Whether an ask is open is decided by the
// database clock at each write. Who has not answered is shown for one ask at a
// time, to the person who asked and the team's owners and organizers only:
// nothing here, and no caller of it, computes a view across asks.

export const ASKS={question:200,option:80,answer:400,minOptions:2,maxOptions:10,openPerTeam:20,openPerMember:5,maxDays:60,missingDays:7,soonHours:48,list:30,closed:10} as const;
const kinds=['one','many','dates','text'] as const;
export type AskKind=typeof kinds[number];
export type Reveal='named'|'counts';
export type AskOption={number:number;label:string};
export type Answer={choices:AskOption[];text:string|null};
/** An ask as every member and follower of the team sees it: named by its number, never by an id. */
export type AskView={number:number;question:string;kind:AskKind;reveal:Reveal;
 by:Member;assistant:string|null;youAsked:boolean;
 /** The tag of the event the ask belongs to, if any. */
 event:string|null;
 createdAt:string;
 /** When it stops taking answers (or stopped, if it was closed early), and the same moment in the team's timezone. */
 closesAt:string;closes:string;timezone:string;open:boolean;
 options:AskOption[];yourAnswer:Answer|null;
 /** "9 of 14 answered": answers given, out of those answers plus the current members who may post and have not answered. */
 answered:number;expected:number;
 /** Names the ask and grants nothing. */
 shareUrl:string};
export type OptionResult=AskOption&{count:number;
 /** Only in a named ask. */
 people?:Member[]};
export type Written={text:string;
 /** Only in a named ask. */
 by?:Member};
/** One ask with its results, by its reveal setting. */
export type AskResult=AskView&{results:OptionResult[];written:Written[];
 /** Present only for the person who asked and the team's owners and organizers, while the ask is open and for 7 days after. */
 missing?:Member[];
 /** The caller may close it: they asked it, or they are an owner or organizer. */
 canClose:boolean};
export type AskDetail={team:TeamHead;timezone:string;today:string;ask:AskResult;untrusted:true};
export type AskList={team:TeamHead;timezone:string;today:string;open:Listed<AskView>;closed:Listed<AskView>;untrusted:true};

/** SQL: the ask takes answers now. */
const openSql=(k='k')=>`(${k}.closed_at is null and ${k}.closes_at>clock_timestamp())`;
/** SQL: when the ask stops, or stopped, taking answers. */
const endSql=(k='k')=>`coalesce(${k}.closed_at,${k}.closes_at)`;

type Given={personId:string|null;choices:number[];body:string|null};
type Row={id:string;number:number;question:string;kind:AskKind;reveal:Reveal;askerId:string|null;clientId:string|null;event:string|null;createdAt:string;closesAt:string;closes:string;open:boolean;recent:boolean;token:string;
 options:AskOption[];answers:Given[];
 /** How many current members who may post have not answered, and with `detail` who they are. */
 waiting:number;missing:string[]|null};
type Viewer={p:Principal;team:Scope;timezone:string;
 /** The caller is an owner or organizer of the team. */
 manager:boolean};
/** Asks by id, in the order asked for. With `detail`, each carries its results and, for those allowed, who has not answered. */
async function viewAsks(q:Q,viewer:Viewer,ids:string[],detail:false):Promise<AskView[]>;
async function viewAsks(q:Q,viewer:Viewer,ids:string[],detail:true):Promise<AskResult[]>;
async function viewAsks(q:Q,{p,team,timezone,manager}:Viewer,ids:string[],detail:boolean):Promise<(AskView|AskResult)[]> {
 if(!ids.length)return [];
 // One statement, whatever the number of asks: each ask with its options and answers beside it. The current members who may
 // post are the people an open ask is waiting for; they are the same for every ask of the team, so they are read once.
 // Where people are otherwise equal on screen, their order ends in an id, so it is the same on every run.
 const {rows}=await q.query<Row>(`with posting as materialized (select m.person_id as id from emba_membership m where m.org_id=$1 and m.revoked_at is null and ${posts('m.person_id')})
  select k.id,k.number,k.question,k.kind,k.reveal,k.asker_id as "askerId",k.client_id as "clientId",
   (select e.slug from emba_team_event e where e.id=k.event_id and e.archived_at is null) as event,
   k.created_at as "createdAt",${endSql()} as "closesAt",${local(endSql(),'$4::text')} as closes,${openSql()} as open,
   ${endSql()}>clock_timestamp()-interval '${ASKS.missingDays} days' as recent,k.share_token as token,
   coalesce((select json_agg(json_build_object('number',o.position::int,'label',o.label) order by o.position) from emba_ask_option o where o.ask_id=k.id),'[]') as options,
   coalesce((select json_agg(json_build_object('personId',a.person_id,'choices',a.choices::int[],'body',a.body) order by a.person_id nulls last,a.id) from emba_ask_answer a where a.ask_id=k.id),'[]') as answers,
   (select count(*)::int from posting m where not exists(select 1 from emba_ask_answer a where a.ask_id=k.id and a.person_id=m.id)) as waiting,
   case when $5::boolean then coalesce((select json_agg(m.id order by m.id) from posting m where not exists(select 1 from emba_ask_answer a where a.ask_id=k.id and a.person_id=m.id)),'[]') end as missing
  from emba_ask k where k.org_id=$1 and k.loop_id=$2 and k.id=any($3::uuid[])`,[team.orgId,team.loopId,ids,timezone,detail]);
 const person=await viewMembers(q,p,team,rows.flatMap(row=>[row.askerId,...(detail?[...row.answers.map(answer=>answer.personId),...(row.missing??[])]:[])]));
 return ids.flatMap(id=>rows.filter(row=>row.id===id)).map(({id:_id,askerId,clientId,recent,token,options,answers:given,waiting,missing,...row})=>{
  void _id;
  const shaped=(answer:Given):Answer=>({choices:options.filter(option=>answer.choices.includes(option.number)),text:answer.body});
  const yours=given.find(answer=>answer.personId===p.personId);
  const view:AskView={...row,createdAt:new Date(row.createdAt).toISOString(),closesAt:new Date(row.closesAt).toISOString(),timezone,by:person(askerId),assistant:clientId,youAsked:askerId===p.personId,
   options,yourAnswer:yours?shaped(yours):null,answered:given.length,expected:given.length+waiting,shareUrl:appUrl(`/a/${token}`)};
  if(!detail)return view;
  const named=row.reveal==='named',mayManage=askerId===p.personId||manager;
  const results:OptionResult[]=options.map(option=>{
   const chose=given.filter(answer=>answer.choices.includes(option.number));
   return {...option,count:chose.length,...(named?{people:chose.map(answer=>person(answer.personId)).sort(byName)}:{})};
  });
  // Written answers of a counts ask carry no name and no order of arrival.
  const texts=given.filter(answer=>answer.body!==null);
  const written:Written[]=named?texts.map(answer=>({text:answer.body!,by:person(answer.personId)})).sort((a,b)=>byName(a.by!,b.by!)):texts.map(answer=>({text:answer.body!})).sort((a,b)=>a.text.localeCompare(b.text));
  return {...view,results,written,...(mayManage&&recent?{missing:(missing??[]).map(person).sort(byName)}:{}),canClose:mayManage&&row.open};
 });
}

/** The message a person pastes into a chat to share an ask: the question, then the link on its own line. */
export const askShareMessage=(ask:AskView)=>`${ask.question}\n${ask.shareUrl}`;
/** The reminder the asker sends by hand. It says how many, by when and where, and names nobody. */
export const askReminder=(ask:AskView)=>`${ask.expected-ask.answered} still to answer by ${ask.closes}.\n${ask.shareUrl}`;

const dueSql='k.org_id=$1 and k.loop_id=$2 and k.closed_at is null and k.closes_at<=clock_timestamp()';
/** True when an ask of the team passed its closing time and the change sequence does not say so yet. */
export async function asksDue(q:Q,team:Scope):Promise<boolean> {
 return (await q.query(`select 1 from emba_ask k where ${dueSql} limit 1`,[team.orgId,team.loopId])).rows.length>0;
}
/** Notes each ask that passed its closing time as closed, and adds it to the change sequence as closed by Loop. The caller holds the team's lock. */
async function closeDue(q:Q,team:Scope):Promise<void> {
 const {rows}=await q.query<{id:string}>(`update emba_ask k set closed_at=k.closes_at where ${dueSql} returning k.id,k.number`,[team.orgId,team.loopId]);
 for(const row of rows)await logChange(q,team,'ask_closed',{askId:row.id},null,null);
}
/**
 * The same, for a read that found asks past their time. Nothing is decided
 * here: an ask is closed by the clock whether or not this has run. If the team
 * is busy the next read does it.
 */
export async function closeDueAsks(db:Db,team:Scope):Promise<void> {
 try{
  await db.tx(async q=>{
   await q.query("set local lock_timeout='2s'");
   const {rows}=await q.query('select 1 from emba_team_state where org_id=$1 and loop_id=$2 for update',[team.orgId,team.loopId]);
   if(rows.length)await closeDue(q,team);
  });
 }catch(error){
  if(!['55P03','40P01','40001'].includes((error as {code?:string}).code??''))throw error;
 }
}

const askNumber=z.number().int().min(1).max(2147483647);
const viewer=(ctx:WriteCtx):Viewer=>({p:ctx.p,team:ctx.team,timezone:ctx.timezone,manager:ctx.manager});
const result=async(ctx:WriteCtx,id:string):Promise<AskResult>=>(await viewAsks(ctx.q,viewer(ctx),[id],true))[0];

export type AskWrite=
 |{saved:true;created:boolean;ask:AskResult}
 |Refused
 |{saved:false;reason:'cap';cap:'open_asks'|'own_open_asks'}
 |{saved:false;reason:'options';problem:'too_few'|'too_many'|'duplicate'|'not_for_text'|'not_a_date'}
 |{saved:false;reason:'closing_time';problem:'past'|'too_far'}
 |{saved:false;reason:'unknown_event';value:string};
type AskDeclined=Exclude<AskWrite,{saved:true}|Refused>;
const day=(value:string)=>{const date=new Date(`${value}T00:00:00Z`);return /^20\d{2}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(date.getTime())&&date.toISOString().startsWith(value);};
const askSchema=z.strictObject({...scope,question:lineSchema(ASKS.question),kind:z.enum(kinds),options:z.array(z.string().max(ASKS.option*8)).max(50).default([]),
 closesAt:moment,reveal:z.enum(['named','counts']).default('named'),event:nameSchema.optional()});
/** Asks the team a question. Any member who may post, on the site or through an assistant with a read-and-write grant. */
export async function createAsk(db:Db,p:Principal,input:unknown):Promise<AskWrite> {
 const data=askSchema.parse(input),option=lineSchema(ASKS.option);
 return teamWrite<Exclude<AskWrite,Refused>>(db,p,data,{need:'post',lock:true,count:true},async ctx=>{
  const no=(declined:AskDeclined)=>stop<AskDeclined>(declined);
  await closeDue(ctx.q,ctx.team);
  const labels=data.options.map(label=>option.parse(label));
  if(data.kind==='text'){if(labels.length)no({saved:false,reason:'options',problem:'not_for_text'});}
  else{
   if(labels.length<ASKS.minOptions)no({saved:false,reason:'options',problem:'too_few'});
   if(labels.length>ASKS.maxOptions)no({saved:false,reason:'options',problem:'too_many'});
   if(new Set(labels.map(label=>label.toLowerCase())).size<labels.length)no({saved:false,reason:'options',problem:'duplicate'});
   if(data.kind==='dates'&&!labels.every(day))no({saved:false,reason:'options',problem:'not_a_date'});
  }
  const {rows:[event]}=data.event?await ctx.q.query<{id:string}>('select id from emba_team_event where org_id=$1 and loop_id=$2 and slug=$3 and archived_at is null for share',[data.orgId,data.loopId,data.event]):{rows:[]};
  if(data.event&&!event)no({saved:false,reason:'unknown_event',value:data.event});
  // One reading of the database clock decides both bounds and becomes the ask's creation time.
  const {rows:[time]}=await ctx.q.query<{closes:string;now:string;past:boolean;far:boolean}>(`with t as (select ${instant(1,2)} as closes,date_trunc('milliseconds',clock_timestamp()) as now)
   select closes,now,closes<=now as past,closes-now>interval '${ASKS.maxDays} days' as far from t`,[data.closesAt,ctx.timezone]);
  if(time.past)no({saved:false,reason:'closing_time',problem:'past'});
  if(time.far)no({saved:false,reason:'closing_time',problem:'too_far'});
  // The same open question from the same person is the same ask: a repeated call saves nothing new.
  const {rows:mine}=await ctx.q.query<{id:string;question:string;kind:AskKind;labels:string[]}>(`select k.id,k.question,k.kind,coalesce((select array_agg(o.label order by o.position) from emba_ask_option o where o.ask_id=k.id),'{}') as labels
   from emba_ask k where k.org_id=$1 and k.loop_id=$2 and k.asker_id=$3 and ${openSql()}`,[data.orgId,data.loopId,p.personId]);
  const twin=mine.find(ask=>ask.question===data.question&&ask.kind===data.kind&&ask.labels.join('\n')===labels.join('\n'));
  if(twin)return {saved:true,created:false,ask:await result(ctx,twin.id)};
  const {rows:[open]}=await ctx.q.query<{n:number}>(`select count(*)::int as n from emba_ask k where k.org_id=$1 and k.loop_id=$2 and ${openSql()}`,[data.orgId,data.loopId]);
  if(open.n>=ASKS.openPerTeam)no({saved:false,reason:'cap',cap:'open_asks'});
  if(mine.length>=ASKS.openPerMember)no({saved:false,reason:'cap',cap:'own_open_asks'});
  const {rows:[ask]}=await ctx.q.query<{id:string}>('insert into emba_ask(org_id,loop_id,number,asker_id,client_id,event_id,question,kind,reveal,created_at,closes_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id',
   [data.orgId,data.loopId,await ctx.nextNumber(),p.personId,p.clientId,event?.id??null,data.question,data.kind,data.reveal,time.now,time.closes]);
  for(const [index,label] of labels.entries())await ctx.q.query('insert into emba_ask_option(ask_id,position,label) values($1,$2,$3)',[ask.id,index+1,label]);
  await ctx.log('asked',{askId:ask.id});
  return {saved:true,created:true,ask:await result(ctx,ask.id)};
 });
}

export type AnswerWrite=
 |{saved:true;changed:boolean;ask:AskResult}
 |Refused
 |{saved:false;reason:'unknown_ask';value:number}
 // The ask stopped taking answers. The result is the one this caller may see.
 |{saved:false;reason:'closed';ask:AskResult}
 |{saved:false;reason:'unknown_option';value:string;ask:AskResult}
 |{saved:false;reason:'answer_shape';problem:'needs_text'|'needs_choice'|'one_only';ask:AskResult};
type AnswerDeclined=Exclude<AnswerWrite,{saved:true}|Refused>;
type Held={id:string;kind:AskKind;reveal:Reveal;askerId:string|null;open:boolean};
/** The ask by its number in the team, with a lock on its row: `share` for an answer, `update` to close it or change its setting. */
async function held(ctx:WriteCtx,number:number,lock:'share'|'update'):Promise<Held|undefined> {
 const {rows:[row]}=await ctx.q.query<Held>(`select k.id,k.kind,k.reveal,k.asker_id as "askerId",${openSql()} as open from emba_ask k where k.org_id=$1 and k.loop_id=$2 and k.number=$3 for ${lock}`,[ctx.team.orgId,ctx.team.loopId,number]);
 return row;
}
const answerSchema=z.strictObject({...scope,number:askNumber,choices:z.array(z.union([z.number().int(),z.string().max(ASKS.option*8)])).max(20).optional(),text:z.string().max(ASKS.answer*8).optional(),remove:z.boolean().default(false),route});
/**
 * Answers an ask, replaces the caller's earlier answer, or with `remove` takes
 * it back. Only ever the caller's own answer. A choice is named by its number
 * or its label.
 */
export async function answerAsk(db:Db,p:Principal,input:unknown):Promise<AnswerWrite> {
 const data=answerSchema.parse(input);
 return teamWrite<Exclude<AnswerWrite,Refused>>(db,p,data,{need:'post',count:true},async ctx=>{
  const no=(declined:AnswerDeclined)=>stop<AnswerDeclined>(declined);
  const ask=await held(ctx,data.number,'share');
  if(!ask)return no({saved:false,reason:'unknown_ask',value:data.number});
  if(!ask.open)no({saved:false,reason:'closed',ask:await result(ctx,ask.id)});
  const {rows:[before]}=await ctx.q.query<{choices:number[];body:string|null}>('select choices::int[] as choices,body from emba_ask_answer where ask_id=$1 and person_id=$2 for update',[ask.id,p.personId]);
  if(data.remove){
   if(before)await ctx.q.query('delete from emba_ask_answer where ask_id=$1 and person_id=$2',[ask.id,p.personId]);
   return {saved:true,changed:Boolean(before),ask:await result(ctx,ask.id)};
  }
  const shape=async(problem:'needs_text'|'needs_choice'|'one_only')=>no({saved:false,reason:'answer_shape',problem,ask:await result(ctx,ask.id)});
  let choices:number[]=[],body:string|null=null;
  if(ask.kind==='text'){
   body=data.text?.trim()?lineSchema(ASKS.answer).parse(data.text):'';
   if(!body||data.choices?.length)await shape('needs_text');
  }else{
   if(data.text!==undefined||!data.choices?.length)await shape('needs_choice');
   const {rows:options}=await ctx.q.query<AskOption>('select position::int as number,label from emba_ask_option where ask_id=$1 order by position',[ask.id]);
   for(const named of data.choices!){
    const text=String(named).trim().toLowerCase();
    const found=options.find(option=>option.label.toLowerCase()===text)??(/^\d{1,2}$/.test(text)?options.find(option=>option.number===Number(text)):undefined);
    if(!found)return no({saved:false,reason:'unknown_option',value:String(named).slice(0,ASKS.option),ask:await result(ctx,ask.id)});
    if(!choices.includes(found.number))choices.push(found.number);
   }
   choices=choices.sort((a,b)=>a-b);
   if(ask.kind==='one'&&choices.length>1)await shape('one_only');
  }
  if(before&&before.body===body&&before.choices.map(Number).join()===choices.join())return {saved:true,changed:false,ask:await result(ctx,ask.id)};
  const how=arrival(p,data.route);
  await ctx.q.query(`insert into emba_ask_answer(ask_id,person_id,choices,body,route,client_id) values($1,$2,$3::smallint[],$4,$5,$6)
   on conflict(ask_id,person_id) where person_id is not null do update set choices=excluded.choices,body=excluded.body,route=excluded.route,client_id=excluded.client_id,at=clock_timestamp()`,[ask.id,p.personId,choices,body,how.route,how.clientId]);
  return {saved:true,changed:true,ask:await result(ctx,ask.id)};
 });
}

export type AskChange=
 |{saved:true;changed:boolean;ask:AskResult}
 |Refused
 |{saved:false;reason:'unknown_ask';value:number}
 // Closing belongs to the person who asked and to owners and organizers; the reveal setting to the person who asked.
 |{saved:false;reason:'not_yours'}
 |{saved:false;reason:'reveal_fixed';ask:AskResult};
type ChangeDeclined=Exclude<AskChange,{saved:true}|Refused>;
/** Closes an ask before its time. The person who asked, or an owner or organizer, on the site or through an assistant. It is not reopened. */
export async function closeAsk(db:Db,p:Principal,input:unknown):Promise<AskChange> {
 const data=z.strictObject({...scope,number:askNumber}).parse(input);
 return teamWrite<Exclude<AskChange,Refused>>(db,p,data,{need:'post',lock:true,count:true},async ctx=>{
  await closeDue(ctx.q,ctx.team);
  const ask=await held(ctx,data.number,'update');
  if(!ask)return stop<ChangeDeclined>({saved:false,reason:'unknown_ask',value:data.number});
  if(ask.askerId!==p.personId&&!ctx.manager)stop<ChangeDeclined>({saved:false,reason:'not_yours'});
  if(!ask.open)return {saved:true,changed:false,ask:await result(ctx,ask.id)};
  await ctx.q.query('update emba_ask set closed_at=clock_timestamp() where id=$1',[ask.id]);
  await ctx.log('ask_closed',{askId:ask.id});
  return {saved:true,changed:true,ask:await result(ctx,ask.id)};
 });
}
/** Switches a named ask to totals only, before anyone has answered. Only the person who asked. It is not switched back. */
export async function setAskReveal(db:Db,p:Principal,input:unknown):Promise<AskChange> {
 const data=z.strictObject({...scope,number:askNumber,reveal:z.enum(['named','counts'])}).parse(input);
 return teamWrite<Exclude<AskChange,Refused>>(db,p,data,{need:'post',count:true},async ctx=>{
  const ask=await held(ctx,data.number,'update');
  if(!ask)return stop<ChangeDeclined>({saved:false,reason:'unknown_ask',value:data.number});
  if(ask.askerId!==p.personId)stop<ChangeDeclined>({saved:false,reason:'not_yours'});
  if(ask.reveal===data.reveal)return {saved:true,changed:false,ask:await result(ctx,ask.id)};
  const {rows:answers}=await ctx.q.query('select 1 from emba_ask_answer where ask_id=$1 limit 1',[ask.id]);
  // Only toward showing less: a member who opened a totals-only ask is never named by an answer sent a moment later.
  if(answers.length||!ask.open||data.reveal==='named')stop<ChangeDeclined>({saved:false,reason:'reveal_fixed',ask:await result(ctx,ask.id)});
  await ctx.q.query('update emba_ask set reveal=$2 where id=$1',[ask.id,data.reveal]);
  return {saved:true,changed:true,ask:await result(ctx,ask.id)};
 });
}

const reader=async(q:Q,p:Principal,team:Scope,timezone:string):Promise<Viewer>=>({p,team,timezone,manager:await canAccessLoop(q,p,team.orgId,team.loopId,'manage')});
/** One ask with its results. Members and followers of the team; nobody else. */
export async function askResults(db:Db,p:Principal,input:unknown):Promise<AskDetail> {
 const {number,...team}=z.strictObject({...scope,number:askNumber}).parse(input);
 return reading(db,p,team,async({q,...base})=>{
  const {rows:[found]}=await q.query<{id:string}>('select id from emba_ask where org_id=$1 and loop_id=$2 and number=$3',[team.orgId,team.loopId,number]);
  if(!found)throw new EmbaError('not_found');
  const [ask]=await viewAsks(q,await reader(q,p,team,base.timezone),[found.id],true);
  return {team:base.team,timezone:base.timezone,today:base.today,ask,untrusted:true as const};
 });
}
/** The team's open asks, soonest to close first, and those closed in the last 7 days. Counts only: no results, and never who has not answered. */
export async function listAsks(db:Db,p:Principal,input:unknown):Promise<AskList> {
 const team=z.strictObject(scope).parse(input);
 return reading(db,p,team,async({q,...base})=>{
  const who=await reader(q,p,team,base.timezone);
  const listed=async(where:string,order:string,limit:number):Promise<Listed<AskView>>=>{
   const {rows}=await q.query<{id:string;total:number}>(`select k.id,count(*) over()::int as total from emba_ask k where k.org_id=$1 and k.loop_id=$2 and ${where} order by ${order} limit ${limit}`,[team.orgId,team.loopId]);
   return {items:await viewAsks(q,who,rows.map(row=>row.id),false),more:Math.max(0,(rows[0]?.total??0)-rows.length)};
  };
  return {team:base.team,timezone:base.timezone,today:base.today,open:await listed(openSql(),'k.closes_at,k.number',ASKS.list),
   closed:await listed(`not ${openSql()} and ${endSql()}>clock_timestamp()-interval '${ASKS.missingDays} days'`,`${endSql()} desc,k.number desc`,ASKS.closed),untrusted:true as const};
 });
}

/** An open ask the caller has yet to answer. */
export type Unanswered=AskView&{
 /** It closes within 48 hours. */
 closingSoon:boolean};
/** For what is new and the brief, inside their snapshot: how many asks are open, and the open asks this caller may answer and has not. */
export async function openAsks(q:Q,p:Principal,team:Scope,timezone:string):Promise<{open:number;unanswered:Listed<Unanswered>}> {
 const {rows:[count]}=await q.query<{n:number}>(`select count(*)::int as n from emba_ask k where k.org_id=$1 and k.loop_id=$2 and ${openSql()}`,[team.orgId,team.loopId]);
 // A follower reads asks and cannot answer them, so none is waiting for a follower.
 if(!count.n||!await canAccessLoop(q,p,team.orgId,team.loopId,'post'))return {open:count.n,unanswered:{items:[],more:0}};
 const {rows}=await q.query<{id:string;soon:boolean;total:number}>(`select k.id,k.closes_at<=clock_timestamp()+interval '${ASKS.soonHours} hours' as soon,count(*) over()::int as total from emba_ask k
  where k.org_id=$1 and k.loop_id=$2 and ${openSql()} and not exists(select 1 from emba_ask_answer a where a.ask_id=k.id and a.person_id=$3) order by k.closes_at,k.number limit ${ASKS.list}`,[team.orgId,team.loopId,p.personId]);
 const views=await viewAsks(q,{p,team,timezone,manager:false},rows.map(row=>row.id),false);
 return {open:count.n,unanswered:{items:views.map((view,index)=>({...view,closingSoon:rows[index].soon})),more:Math.max(0,(rows[0]?.total??0)-rows.length)}};
}
/** For the brief, inside its snapshot: how many asks are open, and how many of them the caller may answer and has not. Counts only: no ask is built to be counted. */
export async function openAskCounts(q:Q,p:Principal,team:Scope):Promise<{open:number;unanswered:number}> {
 const {rows:[count]}=await q.query<{open:number;unanswered:number}>(`select count(*)::int as open,count(*) filter(where not exists(select 1 from emba_ask_answer a where a.ask_id=k.id and a.person_id=$3))::int as unanswered
  from emba_ask k where k.org_id=$1 and k.loop_id=$2 and ${openSql()}`,[team.orgId,team.loopId,p.personId]);
 // A follower reads asks and cannot answer them, so none is waiting for a follower.
 return {open:count.open,unanswered:count.unanswered&&await canAccessLoop(q,p,team.orgId,team.loopId,'post')?count.unanswered:0};
}
/** Asks by id as members see them, for entries of the change sequence. */
export const asksById=(q:Q,p:Principal,team:Scope,timezone:string,ids:string[]):Promise<(AskView&{id:string})[]>=>
 viewAsks(q,{p,team,timezone,manager:false},ids,false).then(views=>views.map((view,index)=>({...view,id:ids[index]})));

/** What someone outside the team may see of an ask: the question, the group's name and the closing time it was given. Nothing about answers, and nothing about whether it was closed early. */
export type AskOutside={group:string;question:string;closesAt:string;closes:string;timezone:string};
export type AskShare=
 |{view:'member';namespace:string;groupSlug:string;scope:Scope;detail:AskDetail;outside:AskOutside}
 |{view:'outside';outside:AskOutside;signedIn:boolean;join:JoinStep};
/**
 * The page behind an ask's share link. The token names the ask and grants
 * nothing: a member or follower of the team gets the ask, and anyone else
 * (signed out, or signed in and not in the team) gets the outside view. The
 * link preview is built from `outside` alone.
 */
export async function askShare(db:Db,p:Principal|null,input:string):Promise<AskShare> {
 const shareToken=z.string().regex(/^[0-9a-f]{32}$/).parse(input);
 const {rows:[found]}=await db.query<AskOutside&Scope&{number:number;namespace:string;groupSlug:string;mode:'ask_first'|'admit'|null;requested:boolean}>(`select k.org_id as "orgId",k.loop_id as "loopId",k.number,a.namespace,a.slug as "groupSlug",coalesce((select g.name from emba_loop g where g.org_id=k.org_id and g.id=k.loop_id),o.name) as "group",k.question,
   k.closes_at as "closesAt",${local('k.closes_at',"coalesce(s.timezone,'UTC')")} as closes,coalesce(s.timezone,'UTC') as timezone,
   (select l.join_mode from emba_group_request_link l where l.org_id=k.org_id and l.loop_id=k.loop_id and l.disabled_at is null) as mode,
   exists(select 1 from emba_group_membership_request r where r.org_id=k.org_id and r.loop_id=k.loop_id and r.person_id=$2::uuid and r.state='pending') as requested
  from emba_ask k join emba_group_address a on a.org_id=k.org_id and a.loop_id=k.loop_id and a.retired_at is null join emba_organization o on o.id=k.org_id
   left join emba_team_state s on s.org_id=k.org_id and s.loop_id=k.loop_id
  where k.share_token=$1`,[shareToken,p?.personId??null]);
 if(!found)throw new EmbaError('not_found');
 const {orgId,loopId,number,namespace,groupSlug,mode,requested,...facts}=found;
 const outside:AskOutside={...facts,closesAt:new Date(facts.closesAt).toISOString()};
 // Only a person on the site is ever shown the member view; an assistant has its own tools.
 if(p&&p.clientId===null){
  try{return {view:'member',namespace,groupSlug,scope:{orgId,loopId},detail:await askResults(db,p,{orgId,loopId,number}),outside};}
  catch(error){if(!(error instanceof EmbaError)||(error.code!=='forbidden'&&error.code!=='not_found'))throw error;}
 }
 return {view:'outside',outside,signedIn:Boolean(p),join:mode?{mode,requested}:null};
}
