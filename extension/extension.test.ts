import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {beforeAll,describe,expect,it,vi} from 'vitest';

// Spec: openspec/changes/loopd-browser-extension/specs/browser-extension ("A card on event pages of four sites", "People
// you know are in", "I'm in from the card", "Not connected"). The extension's scripts are plain scripts that put what
// they make on globalThis, as Chrome loads them.
type Pages={isEventPage(href:string):boolean};
type Card={CSS:string;draw(answer:object,on:Record<string,(...args:unknown[])=>void>,state?:{said?:string;busy?:boolean}):HTMLElement};
let pages:Pages,card:Card;
beforeAll(async()=>{
 // Run as Chrome runs a content script: a plain script in the page's global scope.
 for(const file of ['pages.js','card.js'])(0,eval)(readFileSync(join(__dirname,file),'utf8'));
 ({LoopdPages:pages,LoopdCard:card}=globalThis as unknown as {LoopdPages:Pages;LoopdCard:Card});
});

describe('which pages get a card',()=>{
 it('single event pages of the four sites',()=>{
  for(const href of ['https://lu.ma/fall-founders-mixer','https://luma.com/fall-founders-mixer?tk=x','https://posh.vip/e/rooftop-closing-party','https://www.eventbrite.com/e/nyc-climate-tech-night-tickets-123',
   'https://cornelltech.campusgroups.com/rsvp?id=2132977','https://cornelltech.campusgroups.com/CTDEI/rsvp_boot?id=2132977','https://cornelltech.campusgroups.com/w/_/_/events/Y29ybmVsbHRlY2g6RXZlbnQ6MjEzMjk3Nw=='])
   expect(pages.isEventPage(href),href).toBe(true);
 });
 it('no other page of those sites, and no other site',()=>{
  for(const href of ['https://lu.ma/','https://luma.com/discover','https://lu.ma/u/ana','https://posh.vip/','https://posh.vip/explore','https://www.eventbrite.com/d/ny--new-york/events/',
   'https://cornelltech.campusgroups.com/ctdei/home/','https://cornelltech.campusgroups.com/rsvp','http://lu.ma/x','https://example.com/e/x','https://lu.ma.example.com/x','not a link'])
   expect(pages.isEventPage(href),href).toBe(false);
 });
});

const kit={field:'oklch(82% 0.12 38)',ink:'oklch(24% 0.035 30)',action:'oklch(48.5% 0.185 27)'};
const face=(first:string,me=false)=>({first,photo:`https://loop.test/animals/${first}.webp`,...me?{me:true}:{}});
const on=()=>({in:vi.fn(),leave:vi.fn(),copy:vi.fn(),close:vi.fn()});
const buttons=(node:HTMLElement)=>[...node.querySelectorAll('button,a')].map(each=>each.textContent);

describe('the card',()=>{
 it('people you know are in: their faces and names, a count of the rest, I’m in and Invite',()=>{
  const act=on(),node=card.draw({state:'known',campus:'Cornell Tech',kit,known:[face('Dev'),face('Noor'),face('Bea')],others:8,invite:'https://loop.test/o/abc'},act);
  expect(node.textContent).toContain('3 people you know are in');
  expect(node.textContent).toContain('Dev, Noor, Bea');
  expect(node.textContent).toContain('8 more from Cornell Tech are going');
  expect([...node.querySelectorAll('img')].map(img=>img.getAttribute('alt'))).toEqual(['Dev','Noor','Bea']);
  expect(buttons(node)).toEqual(['Close','I’m in','Invite']);
  expect(node.querySelector('a')!.getAttribute('href')).toBe('https://loop.test/o/abc');
  (node.querySelectorAll('button')[1] as HTMLButtonElement).click();expect(act.in).toHaveBeenCalled();
  expect(node.style.getPropertyValue('--field')).toBe(kit.field);
 });
 it('you are in: your face with theirs, the share link to copy, Invite and Leave, and no word of a ticket',()=>{
  const act=on(),node=card.draw({state:'in',campus:'Cornell Tech',kit,faces:[face('Ana',true),face('Dev'),face('Noor')],others:2,share:'https://loop.test/o/abc',invite:'https://loop.test/o/abc',leave:true},act);
  expect(node.textContent).toContain('You’re in, with Dev and Noor');
  expect(node.textContent).toContain('loop.test/o/abc');
  expect(buttons(node)).toEqual(['Close','Copy link','Invite','Leave']);
  expect(node.textContent).not.toMatch(/regist|ticket/i);
  (node.querySelectorAll('button')[1] as HTMLButtonElement).click();expect(act.copy).toHaveBeenCalledWith('https://loop.test/o/abc');
  // Checked in: no Leave.
  expect(buttons(card.draw({state:'in',campus:'Cornell Tech',kit,faces:[face('Ana',true)],others:0,share:'https://loop.test/o/abc',invite:'https://loop.test/o/abc',leave:false},on()))).toEqual(['Close','Copy link','Invite']);
 });
 it('nobody you know: no names or faces, and a new event says I’m in adds it',()=>{
  const node=card.draw({state:'none',campus:'Cornell Tech',kit,seen:false,others:0},on());
  expect(node.textContent).toContain('Nobody you know yet');
  expect(node.textContent).toContain('adds it to Cornell Tech’s list');
  expect(node.querySelectorAll('img')).toHaveLength(0);
  expect(buttons(node)).toEqual(['Close','I’m in']);
  expect(card.draw({state:'none',campus:'Cornell Tech',kit,seen:true,others:4},on()).textContent).not.toContain('adds it');
 });
 it('not connected: a count when there is one, and one button to sign in',()=>{
  const node=card.draw({state:'out',going:7,connect:'https://loop.test/ext/connect',say:null},on());
  expect(node.textContent).toContain('See who you know here');
  expect(node.textContent).toContain('7 students are going');
  expect(buttons(node)).toEqual(['Close','Sign in with school email']);
  expect(node.querySelector('a')!.getAttribute('href')).toBe('https://loop.test/ext/connect');
  expect(node.querySelectorAll('img')).toHaveLength(0);
  expect(card.draw({state:'out',going:null,connect:'https://loop.test/ext/connect',say:null},on()).textContent).not.toMatch(/going/);
 });
 it('finish in Loopd, and a refusal shown in Loopd’s words',()=>{
  const node=card.draw({state:'finish',finish:'https://loop.test/c/cornell-tech?post=x'},on());
  expect(buttons(node)).toEqual(['Close','Finish in Loopd']);
  const refused=card.draw({state:'none',campus:'Cornell Tech',kit,seen:false,others:0},on(),{said:'You have three plans coming up.'});
  expect(refused.querySelector('[role=alert]')!.textContent).toBe('You have three plans coming up.');
 });
 it('sets every text as text, never as markup',()=>{
  const node=card.draw({state:'known',campus:'<b>x</b>',kit,known:[face('<img src=x onerror=alert(1)>')],others:1,invite:null},on());
  expect(node.querySelectorAll('img')).toHaveLength(1);
  expect(node.querySelector('b')!.textContent).toBe('<img src=x onerror=alert(1)>');
 });
});
