// @vitest-environment node
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it,vi} from 'vitest';
import {eventLink,readEventHtml,readEventPage} from '@/lib/emba/event-link';

// Specs: openspec/changes/loop-group-event-links/specs/event-links. The pages are real ones, saved on 2026-11-18.
const page=(name:string)=>readFileSync(join(__dirname,'..','..','test','fixtures','event-pages',name),'utf8');
const answering=(body:string,init:ResponseInit={})=>vi.fn(async()=>new Response(body,init)) as unknown as typeof fetch;

it('reads name, start, end, place and host from a Luma page',()=>{
 expect(readEventHtml('luma.com',page('luma.html'))).toEqual({ok:true,facts:{name:'Special Special 10 Year Celebration',startsAt:'2026-11-19T23:00:00.000Z',endsAt:'2026-11-20T01:00:00.000Z',place:'40 E 1st St',host:'Special Special'}});
});
it('reads the event a Posh page carries inside its page payload',()=>{
 const read=readEventHtml('posh.vip',page('posh.html'));
 expect(read).toMatchObject({ok:true,facts:{name:'Elevate Social: Harvard vs Yale Day Party (11/21)',startsAt:'2026-11-21T19:00:00.000Z',endsAt:'2026-11-22T01:00:00.000Z',host:'Elevate Social'}});
 expect(read.ok&&read.facts.place).toBeTruthy();
});
it('reads an Eventbrite page',()=>{
 expect(readEventHtml('www.eventbrite.com',page('eventbrite.html'))).toEqual({ok:true,facts:{name:'5TH ANNUAL FRIENDSGIVING 2026(All Black Affair)',startsAt:'2026-11-22T01:00:00.000Z',endsAt:'2026-11-22T07:00:00.000Z',place:'SCALES, 27-29 Herkimer PL, Brooklyn, NY 11216',host:null}});
});
const ld=(event:unknown)=>`<html><script type="application/ld+json">${JSON.stringify(event)}</script></html>`;
it('says it cannot read a page with no event, no name or no start',()=>{
 expect(readEventHtml('luma.com','<html><title>Sign in</title></html>')).toEqual({ok:false,reason:'unreadable'});
 expect(readEventHtml('luma.com',ld({'@type':'Organization',name:'A club'}))).toEqual({ok:false,reason:'unreadable'});
 expect(readEventHtml('luma.com',ld({'@type':'Event',name:'Dinner'}))).toEqual({ok:false,reason:'unreadable'});
 expect(readEventHtml('luma.com',ld({'@type':'Event',name:'Dinner',startDate:'2026-11-20'}))).toEqual({ok:false,reason:'unreadable'});
 expect(readEventHtml('luma.com','<script type="application/ld+json">{not json</script>')).toEqual({ok:false,reason:'unreadable'});
});
it('finds an event in a graph, takes a time with no offset as local, and treats a cancelled event as gone',()=>{
 expect(readEventHtml('luma.com',ld({'@graph':[{'@type':'WebSite'},{'@type':['Thing','MusicEvent'],name:'Gig',startDate:'2026-11-20T18:00:00',endDate:'2026-11-20T17:00:00'}]})))
  .toEqual({ok:true,facts:{name:'Gig',startsAt:'2026-11-20T18:00',endsAt:null,place:null,host:null}});
 expect(readEventHtml('luma.com',ld({'@type':'Event',name:'Gig',startDate:'2026-11-20T18:00:00Z',eventStatus:'https://schema.org/EventCancelled'}))).toEqual({ok:false,reason:'gone'});
});
it('cuts what it reads to the event limits and removes characters that cannot be seen',()=>{
 const read=readEventHtml('luma.com',ld({'@type':'Event',name:`Din\u0000ner‮ \n party ${'x'.repeat(300)}`,startDate:'2026-11-20T18:00:00Z',location:{name:'p'.repeat(400)},organizer:{name:`Ho​st\tname`}}));
 if(!read.ok)throw new Error('not read');
 expect(read.facts.name).toMatch(/^Dinner party x+$/);expect([...read.facts.name]).toHaveLength(80);
 expect(read.facts.place).toHaveLength(120);expect(read.facts.host).toBe('Host name');
});
it('drops the query and fragment on a site it reads, and leaves other links as they are',()=>{
 expect(eventLink('https://lu.ma/4mkwpko0?utm_source=whatsapp#top')).toEqual({url:'https://lu.ma/4mkwpko0',listed:true});
 expect(eventLink('https://posh.vip/e/day-party/?t=abc')).toEqual({url:'https://posh.vip/e/day-party',listed:true});
 expect(eventLink('https://posh.vip/g/someone?x=1')).toEqual({url:'https://posh.vip/g/someone?x=1',listed:false});
 expect(eventLink('https://partiful.com/e/abc?x=1')).toEqual({url:'https://partiful.com/e/abc?x=1',listed:false});
 expect(eventLink('http://lu.ma/abc')).toEqual({problem:'not_https'});
});
it('never requests a link on a site that is not on the list',async()=>{
 const fetch=answering(page('luma.html'));
 expect(await readEventPage('https://partiful.com/e/abc',{fetch})).toEqual({ok:false,reason:'unlisted'});
 expect(await readEventPage('https://lu.ma.evil.example/abc',{fetch})).toEqual({ok:false,reason:'unlisted'});
 expect(fetch).not.toHaveBeenCalled();
});
it('requests a listed page without its query, and does not follow a redirect off the list',async()=>{
 const fetch=answering(page('luma.html'));
 expect(await readEventPage('https://lu.ma/4mkwpko0?utm_source=x',{fetch})).toMatchObject({ok:true,facts:{name:'Special Special 10 Year Celebration'}});
 expect(vi.mocked(fetch).mock.calls.map(call=>call[0])).toEqual(['https://lu.ma/4mkwpko0']);
 const away=answering('',{status:302,headers:{location:'https://elsewhere.example/x'}});
 expect(await readEventPage('https://lu.ma/4mkwpko0',{fetch:away})).toEqual({ok:false,reason:'unreadable'});
 expect(away).toHaveBeenCalledTimes(1);
 expect(await readEventPage('https://lu.ma/4mkwpko0',{fetch:answering('',{status:404})})).toEqual({ok:false,reason:'gone'});
 expect(await readEventPage('https://lu.ma/4mkwpko0',{fetch:answering('',{status:503})})).toEqual({ok:false,reason:'unreadable'});
});
