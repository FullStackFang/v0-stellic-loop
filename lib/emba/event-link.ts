import 'server-only';
import {guardedFetch,type GuardDeps} from '../guarded-fetch';
import {normaliseLink,type LinkProblem} from './team-link';
import {singleLine} from './team-text';

// Reading an event page (design D3 of loop-group-event-links). Loop fetches a
// pasted link only on a fixed list of event sites, one reader per site. A page
// counts as an event when it yields a name and a start. Everything read is
// untrusted text: it is cut to the event's column limits here and shown to
// assistants under the untrusted marking.

/** The sites Loop reads. A link anywhere else is kept as a pointer and never fetched. */
export const EVENT_SITES=['lu.ma','luma.com','posh.vip','www.eventbrite.com'] as const;
const LIMIT={name:80,place:120,host:120} as const;

export type PageFacts={name:string;
 /** An instant when the page gave an offset; otherwise local time (YYYY-MM-DDTHH:MM) to be read in the team's timezone. */
 startsAt:string;endsAt:string|null;place:string|null;host:string|null};
export type PageRead=
 |{ok:true;facts:PageFacts}
 // unlisted: not a site Loop reads, nothing was requested. gone: the page does not exist or says the event is cancelled.
 |{ok:false;reason:'unlisted'|'unreadable'|'gone'};
export type PageReader=(url:string)=>Promise<PageRead>;

const listed=(host:string,path:string)=>(EVENT_SITES as readonly string[]).includes(host)&&(host!=='posh.vip'||path.startsWith('/e/'));
/** The stored form of a pasted link. On a site Loop reads, the query and fragment are dropped, so one event has one link. */
export function eventLink(raw:string):{url:string;listed:boolean}|{problem:LinkProblem} {
 const found=normaliseLink(raw);
 if('problem' in found)return found;
 const path=found.url.slice(`https://${found.host}`.length).split(/[?#]/)[0];
 if(!listed(found.host,path))return {url:found.url,listed:false};
 return {url:`https://${found.host}${path.replace(/\/+$/,'')}`,listed:true};
}

/** One visible line of at most `most` code points, or null. */
export const cut=(value:unknown,most:number):string|null=>typeof value==='string'?[...singleLine(value)].slice(0,most).join('').trim()||null:null;
const when=(value:unknown):string|null=>{
 if(typeof value!=='string')return null;
 const text=value.trim();
 if(!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text))return null;
 if(/(Z|[+-]\d{2}:?\d{2})$/.test(text)){const at=new Date(text);return Number.isNaN(at.getTime())?null:at.toISOString();}
 return text.slice(0,16);
};
type Json=Record<string,unknown>;
const isObject=(value:unknown):value is Json=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const first=(value:unknown):unknown=>Array.isArray(value)?value[0]:value;
/** The first schema.org Event (or a kind of one) anywhere inside a parsed value. */
function findEvent(value:unknown,depth=0):Json|null {
 if(depth>6)return null;
 if(Array.isArray(value)){for(const part of value){const found=findEvent(part,depth+1);if(found)return found;}return null;}
 if(!isObject(value))return null;
 if([value['@type']].flat().some(kind=>typeof kind==='string'&&/Event$/.test(kind)))return value;
 return findEvent(value['@graph'],depth+1);
}
function placeOf(value:unknown):string|null {
 const place=first(value);
 if(typeof place==='string')return cut(place,LIMIT.place);
 if(!isObject(place))return null;
 const address=first(place.address),name=cut(place.name,LIMIT.place);
 const street=typeof address==='string'?cut(address,LIMIT.place):isObject(address)?cut(address.streetAddress,LIMIT.place)??cut(address.addressLocality,LIMIT.place):null;
 // When the name is the address, the address alone says it.
 const same=name&&street&&street.toLowerCase().includes(name.toLowerCase());
 return cut([same?null:name,street].filter(Boolean).join(', '),LIMIT.place);
}
function factsOf(event:Json):PageRead {
 if(typeof event.eventStatus==='string'&&/Cancell?ed$/i.test(event.eventStatus))return {ok:false,reason:'gone'};
 const name=cut(event.name,LIMIT.name),startsAt=when(event.startDate);
 if(!name||!/[\p{L}\p{N}]/u.test(name)||!startsAt)return {ok:false,reason:'unreadable'};
 const end=when(event.endDate),organizer=first(event.organizer);
 // An end is kept only when it can be compared with the start and comes after it.
 const endsAt=end&&end.length===startsAt.length&&end>startsAt?end:null;
 return {ok:true,facts:{name,startsAt,endsAt,place:placeOf(event.location),host:isObject(organizer)?cut(organizer.name,LIMIT.host):cut(organizer,LIMIT.host)}};
}
const parsed=(text:string):unknown=>{try{return JSON.parse(text);}catch{return null;}};
/** Luma and Eventbrite: the first Event in an application/ld+json script. */
function fromScripts(html:string):Json|null {
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  const found=findEvent(parsed(match[1]));
  if(found)return found;
 }
 return null;
}
/** Posh: the same Event object, carried as text inside the page's `self.__next_f.push([1,"…"])` payload. */
function fromPayload(html:string):Json|null {
 for(const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)){
  const text=parsed(match[1]);
  if(typeof text!=='string'||!text.includes('"@type"'))continue;
  const found=findEvent(parsed(text));
  if(found)return found;
 }
 return null;
}
/** The event facts in a page's text. Pure: no request is made here. */
export function readEventHtml(host:string,html:string):PageRead {
 const event=host==='posh.vip'?fromPayload(html)??fromScripts(html):fromScripts(html);
 return event?factsOf(event):{ok:false,reason:'unreadable'};
}
/** Reads one event page. A link on any other site is not requested. Never throws. */
export async function readEventPage(raw:string,deps:GuardDeps={}):Promise<PageRead> {
 const link=eventLink(raw);
 if('problem' in link||!link.listed)return {ok:false,reason:'unlisted'};
 const got=await guardedFetch(link.url,{mode:'link',hosts:EVENT_SITES},deps);
 if(!got.ok)return {ok:false,reason:got.reason==='gone'?'gone':'unreadable'};
 return readEventHtml(new URL(got.url).hostname,got.text);
}
