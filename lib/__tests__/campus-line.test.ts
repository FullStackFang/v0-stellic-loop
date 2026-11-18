// @vitest-environment node
import {expect,it} from 'vitest';
import {readLine,typingTag} from '@/lib/campus/line';

// Spec: openspec/changes/loop-group-event-links/specs/campus-one-line.
const TZ='America/New_York',NOW=new Date('2026-11-18T20:00:00Z');   // Wednesday, 3pm in New York
const read=(text:string)=>readLine(text,TZ,NOW);

it('reads what, when and where out of a line typed like a text',()=>{
 expect(read('dumplings tonight 7 @collegetown')).toEqual({title:'Dumplings',starts:'2026-11-18T19:00',tag:'collegetown',link:null});
 expect(read('  Running, easy 5K tomorrow 7am @Arts-Quad ')).toEqual({title:'Running, easy 5K',starts:'2026-11-19T07:00',tag:'arts-quad',link:null});
 expect(read('@north-campus study group for CS 2110 at 8:30pm')).toEqual({title:'Study group for CS 2110',starts:'2026-11-18T20:30',tag:'north-campus',link:null});
});
it('takes a number as a time only when it is said as one',()=>{
 expect(read('2 tables for board games')).toMatchObject({title:'2 tables for board games',starts:null});
 expect(read('CS 2110 problem set')).toMatchObject({title:'CS 2110 problem set',starts:null});
 expect(read('pickup soccer 5pm')).toMatchObject({title:'Pickup soccer',starts:'2026-11-18T17:00'});
 expect(read('pickup soccer at 5')).toMatchObject({title:'Pickup soccer',starts:'2026-11-18T17:00'});
 expect(read('coffee 9 tomorrow')).toMatchObject({title:'Coffee',starts:'2026-11-19T09:00'});
 expect(read('lunch at noon tomorrow')).toMatchObject({title:'Lunch',starts:'2026-11-19T12:00'});
 expect(read('breakfast 25:00')).toMatchObject({starts:null});
});
it('places a time on the right day',()=>{
 // No day: today if it is still ahead, else tomorrow.
 expect(read('gym 6pm').starts).toBe('2026-11-18T18:00');
 expect(read('gym 2pm').starts).toBe('2026-11-19T14:00');
 // A weekday is the next one, today included while the hour is ahead.
 expect(read('hike sat 10am').starts).toBe('2026-11-21T10:00');
 expect(read('trivia wednesday 9pm').starts).toBe('2026-11-18T21:00');
 expect(read('trivia wed 1pm').starts).toBe('2026-11-25T13:00');
 // "tonight" alone is 7pm; any other day alone is not a time yet.
 expect(read('movie tonight')).toMatchObject({title:'Movie',starts:'2026-11-18T19:00'});
 expect(read('movie tomorrow')).toMatchObject({title:'Movie',starts:null});
 expect(read('drinks tonight 10').starts).toBe('2026-11-18T22:00');
});
it('finds a link in the line and leaves it out of the title',()=>{
 expect(read('lu.ma/4mkwpko0?utm=1 @collegetown')).toEqual({title:'',starts:null,tag:'collegetown',link:'lu.ma/4mkwpko0?utm=1'});
 expect(read('going to this https://posh.vip/e/day-party-1121 who is in')).toMatchObject({title:'Going to this who is in',link:'https://posh.vip/e/day-party-1121'});
});
it('keeps only a well-formed @place, and knows when one is being typed',()=>{
 expect(read('dinner 7pm @a').tag).toBeNull();
 expect(read('dinner 7pm @collegetown-').tag).toBe('collegetown');
 expect(read('email me@cornell.edu about dinner 7pm').tag).toBeNull();
 expect(typingTag('dumplings tonight 7 @coll')).toBe('coll');
 expect(typingTag('dumplings tonight 7 @')).toBe('');
 expect(typingTag('dumplings @collegetown ')).toBeNull();
 expect(typingTag('me@cornell')).toBeNull();
});
