// @vitest-environment node
import {expect,it} from 'vitest';
import {readLine,typingTag,whenIdeas} from '@/lib/campus/line';

// Spec: openspec/changes/loop-group-event-links/specs/campus-one-line.
const TZ='America/New_York',NOW=new Date('2026-11-18T20:00:00Z');   // Wednesday, 3pm in New York
const read=(text:string)=>readLine(text,TZ,NOW);

it('reads what, when and where out of a line typed like a text',()=>{
 expect(read('dumplings tonight 7 @collegetown')).toEqual({title:'Dumplings',starts:'2026-11-18T19:00',tag:'collegetown',tags:['collegetown'],link:null});
 expect(read('  Running, easy 5K tomorrow 7am @Arts-Quad ')).toEqual({title:'Running, easy 5K',starts:'2026-11-19T07:00',tag:'arts-quad',tags:['arts-quad'],link:null});
 expect(read('@north-campus study group for CS 2110 at 8:30pm')).toEqual({title:'Study group for CS 2110',starts:'2026-11-18T20:30',tag:'north-campus',tags:['north-campus'],link:null});
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
 expect(read('lu.ma/4mkwpko0?utm=1 @collegetown')).toEqual({title:'',starts:null,tag:'collegetown',tags:['collegetown'],link:'lu.ma/4mkwpko0?utm=1'});
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
it('reads a part of the day as a time, and a time said with an @ as a time, not a place',()=>{
 expect(read('@central-park go for a run @evening')).toEqual({title:'Go for a run',starts:'2026-11-18T19:00',tag:'central-park',tags:['central-park'],link:null});
 expect(read('coffee tomorrow morning')).toMatchObject({title:'Coffee',starts:'2026-11-19T09:00'});
 expect(read('frisbee this afternoon')).toMatchObject({title:'Frisbee',starts:'2026-11-19T15:00'});   // 3pm has just passed
 expect(read('frisbee in the afternoon sat')).toMatchObject({title:'Frisbee',starts:'2026-11-21T15:00'});
 expect(read('dumplings @tonight @collegetown')).toMatchObject({title:'Dumplings',starts:'2026-11-18T19:00',tag:'collegetown'});
 expect(read('dumplings @7pm @sat')).toMatchObject({title:'Dumplings',starts:'2026-11-21T19:00',tag:null});
 expect(read('good morning yoga 7am')).toMatchObject({title:'Good morning yoga',starts:'2026-11-19T07:00'});
});
it('offers times to add when the line has none: all ahead, none twice, on the day the line names',()=>{
 expect(whenIdeas('go for a run',TZ,NOW)).toEqual([{add:'tonight',starts:'2026-11-18T19:00'},{add:'9am',starts:'2026-11-19T09:00'},{add:'noon',starts:'2026-11-19T12:00'},{add:'tomorrow 7pm',starts:'2026-11-19T19:00'}]);
 expect(whenIdeas('movie sat',TZ,NOW)).toEqual([{add:'9am',starts:'2026-11-21T09:00'},{add:'noon',starts:'2026-11-21T12:00'},{add:'7pm',starts:'2026-11-21T19:00'}]);
 // Late at night, "tonight" has passed and is not offered.
 expect(whenIdeas('go for a run',TZ,new Date('2026-11-19T02:30:00Z')).map(idea=>idea.add)).toEqual(['9am','noon','7pm','sat 10am']);
 expect(whenIdeas('go for a run 6pm',TZ,NOW)).toEqual([]);
});
it('reads a calendar date, and drops the small words around a date, a day and a place',()=>{
 expect(read('hot pot on 12/12 after class at 6pm')).toEqual({title:'Hot pot after class',starts:'2026-12-12T18:00',tag:null,tags:[],link:null});
 expect(read('ski trip dec 5 8am')).toMatchObject({title:'Ski trip',starts:'2026-12-05T08:00'});
 expect(read('brunch on the 22nd of november 11am')).toMatchObject({title:'Brunch',starts:'2026-11-22T11:00'});
 expect(read('Dinner December 3rd, evening')).toMatchObject({title:'Dinner',starts:'2026-12-03T19:00'});
 // A date that has passed this year is next year's; a year can be said.
 expect(read('reunion 1/9 7pm').starts).toBe('2027-01-09T19:00');
 expect(read('party 11/21/26 9pm').starts).toBe('2026-11-21T21:00');
 // Not a date: left in the title.
 expect(read('room 13/45 study 5pm')).toMatchObject({title:'Room 13/45 study',starts:'2026-11-18T17:00'});
 expect(read('may the best team win 5pm').title).toBe('May the best team win');
 // A date with no hour is not a time yet, and the hours offered are on that date.
 expect(read('hot pot 12/12')).toMatchObject({title:'Hot pot',starts:null});
 expect(whenIdeas('hot pot 12/12',TZ,NOW)).toEqual([{add:'9am',starts:'2026-12-12T09:00'},{add:'noon',starts:'2026-12-12T12:00'},{add:'7pm',starts:'2026-12-12T19:00'}]);
 expect(read('hot pot in @collegetown tonight')).toMatchObject({title:'Hot pot',tag:'collegetown'});
 expect(read('movie on sat at 8pm')).toMatchObject({title:'Movie',starts:'2026-11-21T20:00'});
});
// Spec: openspec/changes/loop-campus-tags/specs/campus-tags ("An @ is a tag, and a plan may carry several").
it('reads up to four tags in the order typed, and leaves a fifth in the title',()=>{
 expect(read('morning loop @jogging @collegetown tomorrow 7am')).toEqual({title:'Morning loop',starts:'2026-11-19T07:00',tag:'jogging',tags:['jogging','collegetown'],link:null});
 expect(read('run @a1 @b2 @c3 @d4 @e5 6pm')).toMatchObject({title:'Run @e5',tags:['a1','b2','c3','d4']});
 // Said twice, a tag is one tag.
 expect(read('run @jogging @Jogging 6pm')).toMatchObject({title:'Run',tags:['jogging']});
 expect(read('run 6pm').tags).toEqual([]);
});
it('a time said after an @ is a time beside a tag, and the small word before each tag is dropped',()=>{
 expect(read('@jogging @tonight')).toEqual({title:'',starts:'2026-11-18T19:00',tag:'jogging',tags:['jogging'],link:null});
 expect(read('hot pot in @collegetown at @the-nines on @slope-day tonight')).toMatchObject({title:'Hot pot',tags:['collegetown','the-nines','slope-day']});
});
