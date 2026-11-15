import 'server-only';
import {z} from 'zod';
import type {Db} from '../db';
import {authenticate} from './access';
import {waySql} from './reach';
import {answerAsk,type AskKind,type AskOption} from './team-asks';
import {local,posts} from './team-core';

// Personal answer links (design D5 of loop-club-reach). A message about an
// ask carries a link made for one member and one ask. Its holder can read
// that ask and answer it as that member, and nothing else: no session is
// opened and no other page treats them as signed in. Reading the link writes
// nothing, because mail scanners and chat previews open links. The link stops
// working when the ask closes, when the member leaves the team, and when the
// member stops messages from the team.

const token=z.string().regex(/^[0-9a-f]{32}$/);
export type PersonalAsk={group:string;
 /** The person who asked. */
 asker:string|null;question:string;kind:AskKind;options:AskOption[];closes:string;timezone:string;open:boolean;
 /** What this member has answered, in words. */
 yourAnswer:string|null;
 /** Their answer as option numbers and text, to fill the form. */
 chosen:number[];written:string|null};
type Target={orgId:string;loopId:string;personId:string;askId:string;number:number;valid:boolean;issuer:string|null;subject:string|null}&Omit<PersonalAsk,'options'|'yourAnswer'|'chosen'|'written'>;

async function target(db:Db,value:string):Promise<Target|null> {
 if(!token.safeParse(value).success)return null;
 const {rows:[row]}=await db.query<Target>(`select g.org_id as "orgId",g.loop_id as "loopId",g.person_id as "personId",k.id as "askId",k.number,coalesce(l.name,o.name) as "group",(select p.name from person p where p.id=k.asker_id) as asker,
   k.question,k.kind,${local('k.closes_at',"coalesce(s.timezone,'UTC')")} as closes,coalesce(s.timezone,'UTC') as timezone,(k.closed_at is null and k.closes_at>clock_timestamp()) as open,
   (${posts('g.person_id','g.org_id','g.loop_id')} and ${waySql('g.org_id','g.loop_id','g.person_id')}<>'none') as valid,i.issuer,i.subject
  from emba_reach_message g join emba_ask k on k.id=g.ask_id join emba_loop l on l.org_id=g.org_id and l.id=g.loop_id join emba_organization o on o.id=g.org_id
   left join emba_team_state s on s.org_id=g.org_id and s.loop_id=g.loop_id
   left join lateral (select issuer,subject from emba_identity where person_id=g.person_id and revoked_at is null order by verified_at limit 1) i on true
  where g.answer_token=$1 and g.kind in ('ask_new','ask_reminder')`,[value]);
 return row?.valid&&row.issuer?row:null;
}
async function view(db:Db,t:Target):Promise<PersonalAsk> {
 const {rows:options}=await db.query<AskOption>('select position::int as number,label from emba_ask_option where ask_id=$1 order by position',[t.askId]);
 const {rows:[mine]}=await db.query<{choices:number[];body:string|null}>('select choices::int[] as choices,body from emba_ask_answer where ask_id=$1 and person_id=$2',[t.askId,t.personId]);
 const chosen=(mine?.choices??[]).map(Number);
 return {group:t.group,asker:t.asker,question:t.question,kind:t.kind,options,closes:t.closes,timezone:t.timezone,open:t.open,
  yourAnswer:mine?mine.body??options.filter(option=>chosen.includes(option.number)).map(option=>option.label).join(', '):null,chosen,written:mine?.body??null};
}

/** The ask behind a personal link, for its page. It writes nothing. Null when the link no longer works. */
export async function personalAsk(db:Db,value:string):Promise<PersonalAsk|null> {
 const t=await target(db,value);
 return t?view(db,t):null;
}

export type LinkAnswer=
 |{saved:true;ask:PersonalAsk}
 /** The link no longer works, or the team is busy: nothing says which member or why. */
 |{saved:false;reason:'gone'|'busy'}
 |{saved:false;reason:'closed'|'needs_text'|'needs_choice'|'one_only'|'unknown_option';ask:PersonalAsk};
/**
 * The link's one action: the member's answer to its ask. It goes through the
 * same checks as an answer given on the site, as that member, with the route
 * recorded as the personal link. The identity made here lasts for this one
 * call and is never stored or returned.
 */
export async function answerFromLink(db:Db,value:string,input:{choices?:string[];text?:string}):Promise<LinkAnswer> {
 const t=await target(db,value);
 if(!t)return {saved:false,reason:'gone'};
 const member=await authenticate(db,'personal-link',async()=>({issuer:t.issuer!,subject:t.subject!,expiresAt:Date.now()+60_000}));
 if(!member||member.personId!==t.personId)return {saved:false,reason:'gone'};
 const answer=t.kind==='text'?{text:input.text??''}:{choices:input.choices??[]};
 const result=await answerAsk(db,member,{orgId:t.orgId,loopId:t.loopId,number:t.number,...answer},'personal_link');
 // The ask may have closed between the two reads: say what is true now.
 const now=async()=>view(db,(await target(db,value))??{...t,open:false});
 if(result.saved)return {saved:true,ask:await now()};
 switch(result.reason){
  case 'closed':case 'unknown_option':return {saved:false,reason:result.reason,ask:await now()};
  case 'answer_shape':return {saved:false,reason:result.problem,ask:await now()};
  case 'busy':return {saved:false,reason:'busy'};
  default:return {saved:false,reason:'gone'};
 }
}
