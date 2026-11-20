import 'server-only';
import {z} from 'zod';
import type {Db,Q} from '../db';
import {canAccessLoop,type Principal} from './access';
import {EmbaError} from './errors';
import {randomUUID} from 'node:crypto';
import {embeddingsEnabled,indexDocumentEmbeddings} from './embeddings';
import {processDocument,uploadDocument} from './knowledge';
import {anyTag,noTags,resourceTags,type Tags} from './resource-tags';
import {linkTitle} from './start-sort';
import {reading,scope,stop,teamWrite,viewMembers,type Listed,type Member,type Refused,type Scope} from './team-core';
import {normaliseLink,recognisedHost,type LinkProblem} from './team-link';
import {lineSchema,singleLine} from './team-text';

// Resources (change loop-resources-tab): a team's links, which are their own thing, and its texts, which are the documents
// that already exist. Every link and every text can carry tags that an assistant works out and a person never types.
// Loopd keeps a link's address and name, never what it points at.

export const RESOURCE_LIMITS={links:100,list:100,brief:30,name:120} as const;

export type Described={tags:Tags;described:boolean};
export type LinkView=Described&{id:string;url:string;host:string;recognisedHost:boolean;name:string;by:Member;assistant:string|null;at:string;mayRemove:boolean};
export type TextView=Described&{id:string;version:number;name:string;state:'accepted'|'extracting'|'indexing'|'ready'|'failed';failedStage:string|null;by:Member;assistant:string|null;at:string;mayRemove:boolean};
export type Resources={links:Listed<LinkView>;texts:Listed<TextView>};
/** What an assistant is told of one resource: no id, since it names a resource by its title or its address. */
export type ResourceLine=Described&{name:string;url?:string;host?:string;recognisedHost?:boolean;at:string;assistant:string|null};
export type ResourceLines={links:Listed<ResourceLine>;texts:Listed<ResourceLine>};

type TagColumns={kind:string|null;about:string|null;audience:string|null;foundOn:string|null;summary:string|null;describedAt:string|null};
const tagColumns=(alias:string)=>`${alias}.kind,${alias}.about,${alias}.audience,to_char(${alias}.found_on,'YYYY-MM-DD') as "foundOn",${alias}.summary,${alias}.described_at as "describedAt"`;
const described=(row:TagColumns):Described=>({tags:{kind:row.kind,about:row.about,audience:row.audience,foundOn:row.foundOn,summary:row.summary},described:row.describedAt!==null});
const instantOf=(value:string|Date)=>new Date(value).toISOString();

type LinkRow=TagColumns&{id:string;url:string;host:string;name:string;addedBy:string|null;clientId:string|null;createdAt:string;total:number};
type TextRow=TagColumns&{id:string;version:number;name:string;state:TextView['state'];failedStage:string|null;addedBy:string|null;clientId:string|null;createdAt:string;total:number};
const linkSelect=`select l.id,l.url,l.host,l.name,l.added_by as "addedBy",l.client_id as "clientId",l.created_at as "createdAt",${tagColumns('l')},count(*) over()::int as total from emba_team_link l
 where l.org_id=$1 and l.loop_id=$2 and l.removed_at is null order by l.created_at desc,l.id limit $3`;
const textSelect=`select d.id,v.version,v.title as name,v.state,v.failed_stage as "failedStage",v.uploaded_by as "addedBy",v.client_id as "clientId",v.created_at as "createdAt",${tagColumns('d')},count(*) over()::int as total
 from emba_document d join emba_document_version v on v.document_id=d.id and v.version=d.current_version
 where d.org_id=$1 and d.loop_id=$2 and d.deleted_at is null order by v.created_at desc,d.id limit $3`;
const listed=<R extends {total:number},T>(rows:R[],view:(row:R)=>T):Listed<T>=>({items:rows.map(view),more:Math.max(0,(rows[0]?.total??0)-rows.length)});

/** The team's links and texts, newest first, for the Resources tab. A person may remove what they added, and an organizer anything. */
export async function listResources(db:Db,p:Principal,input:unknown):Promise<Resources> {
 const team=z.strictObject(scope).parse(input);
 return reading(db,p,team,async({q})=>{
  const manager=await canAccessLoop(q,p,team.orgId,team.loopId,'manage');
  const {rows:links}=await q.query<LinkRow>(linkSelect,[team.orgId,team.loopId,RESOURCE_LIMITS.list]);
  const {rows:texts}=await q.query<TextRow>(textSelect,[team.orgId,team.loopId,RESOURCE_LIMITS.list]);
  const people=await viewMembers(q,p,team,[...links,...texts].map(row=>row.addedBy));
  const may=(row:{addedBy:string|null})=>manager||(row.addedBy!==null&&row.addedBy===p.personId);
  return {
   links:listed(links,row=>({id:row.id,url:row.url,host:row.host,recognisedHost:recognisedHost(row.host),name:singleLine(row.name),by:people(row.addedBy),assistant:row.clientId,at:instantOf(row.createdAt),mayRemove:may(row),...described(row)})),
   texts:listed(texts,row=>({id:row.id,version:row.version,name:singleLine(row.name),state:row.state,failedStage:row.failedStage,by:people(row.addedBy),assistant:row.clientId,at:instantOf(row.createdAt),mayRemove:may(row),...described(row)})),
  };
 });
}

/** The same two lists as an assistant reads them in a team brief. Called inside the brief's snapshot. */
export async function resourceLines(q:Q,team:Scope):Promise<ResourceLines> {
 const {rows:links}=await q.query<LinkRow>(linkSelect,[team.orgId,team.loopId,RESOURCE_LIMITS.brief]);
 const {rows:texts}=await q.query<TextRow>(textSelect,[team.orgId,team.loopId,RESOURCE_LIMITS.brief]);
 return {
  links:listed(links,row=>({name:singleLine(row.name),url:row.url,host:row.host,recognisedHost:recognisedHost(row.host),at:instantOf(row.createdAt),assistant:row.clientId,...described(row)})),
  texts:listed(texts,row=>({name:singleLine(row.name),at:instantOf(row.createdAt),assistant:row.clientId,...described(row)})),
 };
}

export type SavedLink=Described&{saved:true;kind:'link';existed:boolean;name:string;url:string;host:string;recognisedHost:boolean};
export type LinkDeclined=Refused|{saved:false;reason:'link_refused';problem:LinkProblem}|{saved:false;reason:'cap';cap:'links'};
export type LinkWrite=SavedLink|LinkDeclined;
const nameOf=(raw:string|undefined,fallback:string)=>{
 const given=raw===undefined?'':singleLine(raw);
 return given?lineSchema(RESOURCE_LIMITS.name).parse(given):fallback;
};
const counted=(p:Principal)=>p.clientId!==null;
const addSchema=z.strictObject({...scope,url:z.string().min(1).max(8000),name:z.string().max(RESOURCE_LIMITS.name*8).optional(),tags:resourceTags.optional()});

/** Adds a link to a team. A member who can post may; an assistant needs a grant that reads and writes the team. An address already listed is returned as it is. */
export async function addLink(db:Db,p:Principal,input:unknown):Promise<LinkWrite> {
 const data=addSchema.parse(input);
 const link=normaliseLink(data.url);
 if('problem' in link)return {saved:false,reason:'link_refused',problem:link.problem};
 const name=nameOf(data.name,singleLine(linkTitle(link.url)).slice(0,RESOURCE_LIMITS.name)||link.host),team={orgId:data.orgId,loopId:data.loopId},tags=data.tags;
 return teamWrite<SavedLink|LinkDeclined>(db,p,team,{need:'post',count:counted(p)},async ctx=>{
  const given=anyTag(tags);
  const {rows:[made]}=await ctx.q.query<{id:string}>(`insert into emba_team_link(org_id,loop_id,url,host,name,added_by,client_id,kind,about,audience,found_on,summary,described_at,described_by,described_via)
   select $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::uuid,$7::text,$8::text,$9::text,$10::text,$11::date,$12::text,case when $13::boolean then clock_timestamp() end,case when $13::boolean then $6::uuid end,case when $13::boolean then $7::text end
   where (select count(*) from emba_team_link where org_id=$1 and loop_id=$2 and removed_at is null)<${RESOURCE_LIMITS.links} or exists(select 1 from emba_team_link where org_id=$1 and loop_id=$2 and url=$3 and removed_at is null)
   on conflict(org_id,loop_id,url) where removed_at is null do nothing returning id`,
   [team.orgId,team.loopId,link.url,link.host,name,ctx.p.personId,ctx.p.clientId,tags?.kind??null,tags?.about??null,tags?.audience??null,tags?.foundOn??null,tags?.summary??null,given]);
  if(!made){
   const {rows:[there]}=await ctx.q.query<TagColumns&{id:string;name:string}>(`select l.id,l.name,${tagColumns('l')} from emba_team_link l where l.org_id=$1 and l.loop_id=$2 and l.url=$3 and l.removed_at is null for update`,[team.orgId,team.loopId,link.url]);
   if(!there)return stop({saved:false,reason:'cap',cap:'links'} as const);
   // An assistant that saves a link again with tags describes it, if nobody has yet.
   if(given&&there.describedAt===null){
    await ctx.q.query('update emba_team_link set kind=$2,about=$3,audience=$4,found_on=$5,summary=$6,described_at=clock_timestamp(),described_by=$7,described_via=$8 where id=$1 and described_at is null',
     [there.id,tags?.kind??null,tags?.about??null,tags?.audience??null,tags?.foundOn??null,tags?.summary??null,ctx.p.personId,ctx.p.clientId]);
    return {saved:true,kind:'link',existed:true,name:singleLine(there.name),url:link.url,host:link.host,recognisedHost:recognisedHost(link.host),tags:{...noTags,...cleanTags(tags)},described:true};
   }
   return {saved:true,kind:'link',existed:true,name:singleLine(there.name),url:link.url,host:link.host,recognisedHost:recognisedHost(link.host),...described(there)};
  }
  return {saved:true,kind:'link',existed:false,name,url:link.url,host:link.host,recognisedHost:recognisedHost(link.host),tags:{...noTags,...cleanTags(tags)},described:given};
 });
}
const cleanTags=(tags:z.output<typeof resourceTags>|undefined):Partial<Tags>=>tags?Object.fromEntries(Object.entries({kind:tags.kind,about:tags.about,audience:tags.audience,foundOn:tags.foundOn,summary:tags.summary}).filter(([,value])=>value!==undefined)):{};

export type LinkRemoval={saved:true}|Refused|{saved:false;reason:'not_found'};
/** Site only. The person who added a link, or an organizer, removes it. A removed link is not brought back; adding the address again makes a new one. */
export async function removeLink(db:Db,p:Principal,input:unknown):Promise<LinkRemoval> {
 const data=z.strictObject({...scope,id:z.uuid()}).parse(input);
 return teamWrite<{saved:true}|Refused|{saved:false;reason:'not_found'}>(db,p,data,{need:'post',siteOnly:true},async ctx=>{
  const {rows:[row]}=await ctx.q.query<{addedBy:string|null}>('select added_by as "addedBy" from emba_team_link where id=$1 and org_id=$2 and loop_id=$3 and removed_at is null for update',[data.id,data.orgId,data.loopId]);
  if(!row)return stop({saved:false,reason:'not_found'} as const);
  if(row.addedBy!==ctx.p.personId&&!ctx.manager)throw new EmbaError('forbidden');
  await ctx.q.query('update emba_team_link set removed_at=clock_timestamp() where id=$1',[data.id]);
  return {saved:true};
 });
}

export type DescribeSaved=Described&{saved:true;kind:'link'|'text';name:string};
export type DescribeDeclined=Refused|{saved:false;reason:'unknown'|'ambiguous'|'already_described'};
export type DescribeWrite=DescribeSaved|DescribeDeclined;
const describeSchema=z.strictObject({...scope,ref:z.string().max(8000),tags:resourceTags});
/**
 * Fills in the tags of a link or a text that has none. The item is named by its exact name (a text by its title) or, for a link, its address.
 * Tags are given once: an item that has some is left as it is, and the answer says so.
 */
export async function describeResource(db:Db,p:Principal,input:unknown):Promise<DescribeWrite> {
 const data=describeSchema.parse(input),team={orgId:data.orgId,loopId:data.loopId};
 if(!anyTag(data.tags))throw new z.ZodError([]);
 const ref=singleLine(data.ref),asLink=normaliseLink(ref),address='url' in asLink?asLink.url:null;
 return teamWrite<DescribeSaved|DescribeDeclined>(db,p,team,{need:'post',count:counted(p)},async ctx=>{
  const {rows:links}=await ctx.q.query<TagColumns&{id:string;name:string}>(`select l.id,l.name,${tagColumns('l')} from emba_team_link l where l.org_id=$1 and l.loop_id=$2 and l.removed_at is null and (l.url=$3::text or l.name=$4) for update`,[team.orgId,team.loopId,address,ref]);
  const {rows:texts}=await ctx.q.query<TagColumns&{id:string;name:string}>(`select d.id,v.title as name,${tagColumns('d')} from emba_document d join emba_document_version v on v.document_id=d.id and v.version=d.current_version
   where d.org_id=$1 and d.loop_id=$2 and d.deleted_at is null and v.title=$3 for update of d`,[team.orgId,team.loopId,ref]);
  const found=[...links.map(row=>({kind:'link' as const,row})),...texts.map(row=>({kind:'text' as const,row}))];
  if(!found.length)return stop({saved:false,reason:'unknown'} as const);
  if(found.length>1)return stop({saved:false,reason:'ambiguous'} as const);
  const [{kind,row}]=found;
  if(row.describedAt!==null)return stop({saved:false,reason:'already_described'} as const);
  const t=data.tags;
  await ctx.q.query(`update ${kind==='link'?'emba_team_link':'emba_document'} set kind=$2,about=$3,audience=$4,found_on=$5,summary=$6,described_at=clock_timestamp(),described_by=$7,described_via=$8 where id=$1 and described_at is null`,
   [row.id,t.kind??null,t.about??null,t.audience??null,t.foundOn??null,t.summary??null,ctx.p.personId,ctx.p.clientId]);
  return {saved:true,kind,name:singleLine(row.name),tags:{...noTags,...cleanTags(t)},described:true};
 });
}

export type SavedText=Described&{saved:true;kind:'text';existed:false;name:string;indexed:boolean};
export type TextWrite=SavedText|Refused|{saved:false;reason:'texts_full'};
const textSchema=z.strictObject({...scope,operationId:z.uuid().optional(),name:z.string().min(1).max(1600),body:z.string().min(1),mediaType:z.enum(['text/plain','text/markdown','application/pdf']).default('text/plain'),tags:resourceTags.optional()});
/**
 * Saves a text: pasted words, or the words read from a file (the file itself is never kept). It becomes a document of the team,
 * is read for search straight away, and carries the tags it was given. A member who can post may; an assistant also needs a grant that reads and writes the team.
 */
export async function saveText(db:Db,p:Principal,input:unknown):Promise<TextWrite> {
 const data=textSchema.parse(input),team={orgId:data.orgId,loopId:data.loopId},name=lineSchema(200).parse(singleLine(data.name));
 const {rows:[count]}=await db.query<{total:number}>('select count(*)::int as total from emba_document where org_id=$1 and loop_id=$2 and deleted_at is null',[team.orgId,team.loopId]);
 if(count.total>=100)return {saved:false,reason:'texts_full'};
 const document=await uploadDocument(db,p,{...team,operationId:data.operationId??randomUUID(),title:name,mediaType:data.mediaType,body:data.body,tags:data.tags});
 let indexed=false;
 try{
  await processDocument(db,p,document.id,document.version);
  indexed=true;
  if(embeddingsEnabled())await indexDocumentEmbeddings(db,p,{documentId:document.id,version:document.version});
 }catch{/* Reading can be tried again from the Resources tab; what was saved stays saved. */}
 return {saved:true,kind:'text',existed:false,name,indexed,tags:{...noTags,...cleanTags(data.tags)},described:anyTag(data.tags)};
}
