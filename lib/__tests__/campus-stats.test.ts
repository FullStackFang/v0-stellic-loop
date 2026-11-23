// @vitest-environment node
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {animal,animalOf} from '@/lib/campus/animals';
import {accountOf,areaOf,lastDays,personFacts,recordOpen,siteActions,siteOpens,summarise,waysOf,type Account} from '@/lib/campus/stats';

// The admin's Activity and People sections: what is counted, and from where.
let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});
beforeEach(async()=>{await t.reset();await t.db.query('truncate site_open');});
afterEach(()=>{vi.unstubAllEnvs();});

const ISSUER='https://clerk.example.com';
const signedUp=async(subject:string)=>{const {id}=await makePerson(t.db,subject);await t.db.query('insert into emba_identity(issuer,subject,person_id,verified_at) values($1,$2,$3,now())',[ISSUER,subject,id]);return id;};
const TZ='America/New_York';

describe('the part of the site a page belongs to',()=>{
 it('names each part, and keeps the admin pages out',()=>{
  expect(areaOf('/')).toBe('Front door');
  expect(areaOf('/c/cornell')).toBe('This week');
  expect(areaOf('/c/cornell/post')).toBe('Post a plan');
  expect(areaOf('/c/ink')).toBe('Ink');
  expect(areaOf('/c/doodles')).toBe('Doodles');
  expect(areaOf('/c/doodles/seats')).toBe('Seats');
  expect(areaOf('/conga')).toBe('Conga');
  expect(areaOf('/organizers')).toBe('Organizers');
  expect(areaOf('/groups/connections')).toBe('Assistants');
  expect(areaOf('/groups/acme/team')).toBe('Groups');
  expect(areaOf('/groups/sign-in')).toBe('Sign in');
  expect(areaOf('/o/abcdefghijklmnop')).toBe('Shared plan');
  expect(areaOf('/privacy')).toBe('Terms and privacy');
  expect(areaOf('/trip/somewhere')).toBe('Other');
  expect(areaOf('/c/admin')).toBeNull();
  expect(areaOf('/emba/anything')).toBeNull();
 });
});

describe('counting pages opened',()=>{
 it('keeps the part and the person, never the path, and counts a visitor with no person',async()=>{
  const id=await signedUp('user_a');
  expect(await recordOpen(t.db,'/o/secret-token-1234567',ISSUER,'user_a')).toBe(true);
  expect(await recordOpen(t.db,'/',null,null)).toBe(true);
  expect(await recordOpen(t.db,'/c/cornell',ISSUER,'user_nobody')).toBe(true);
  expect(await recordOpen(t.db,'/c/admin',ISSUER,'user_a')).toBe(false);
  const {rows}=await t.db.query<{person_id:string|null;area:string}>('select person_id,area from site_open order by id');
  expect(rows).toEqual([{person_id:id,area:'Shared plan'},{person_id:null,area:'Front door'},{person_id:null,area:'This week'}]);
 });
 it('adds them up by part, by person and by day in the campus timezone',async()=>{
  const a=await signedUp('user_a'),b=await signedUp('user_b');
  // 03:30 UTC on the 20th is still the evening of the 19th in New York.
  await t.db.query(`insert into site_open(person_id,area,opened_at) values($1,'This week','2026-11-20T03:30:00Z'),($1,'This week','2026-11-20T15:00:00Z'),($2,'Groups','2026-11-20T16:00:00Z'),(null,'Front door','2026-11-20T17:00:00Z'),($2,'Groups','2026-10-01T12:00:00Z')`,[a,b]);
  const week=await siteOpens(t.db,new Date('2026-11-14T00:00:00Z'),TZ);
  expect(week.total).toBe(4);expect(week.people).toBe(2);
  expect(week.areas).toEqual([{area:'This week',opens:2},{area:'Front door',opens:1},{area:'Groups',opens:1}]);
  expect(week.days.get('2026-11-19')).toEqual({people:1,opens:1});
  expect(week.days.get('2026-11-20')).toEqual({people:2,opens:3});
  expect(week.since).toBe('2026-10-01');
  expect((await siteOpens(t.db,null,TZ)).total).toBe(5);
 });
 it('counts someone not signed in once, by the number their browser carries',async()=>{
  const a=await signedUp('user_a'),one='a'.repeat(32),two='b'.repeat(32);
  expect(await recordOpen(t.db,'/conga',null,null,one)).toBe(true);
  await recordOpen(t.db,'/conga',null,null,one);await recordOpen(t.db,'/',null,null,two);await recordOpen(t.db,'/',ISSUER,'user_a',one);await recordOpen(t.db,'/',null,null);
  const all=await siteOpens(t.db,null,TZ),[day]=[...all.days.values()];
  expect(all).toMatchObject({total:5,people:1,visitors:2});
  expect(day).toEqual({people:3,opens:5});
  expect((await t.db.query('select 1 from site_open where person_id=$1 and visitor=$2',[a,one])).rows).toHaveLength(1);
 });
 it('counts as before while the visitor column is not there',async()=>{
  const old={query:async(sql:string,values?:unknown[])=>{if(/\bvisitor\b/.test(sql))throw Object.assign(new Error('column "visitor" does not exist'),{code:'42703'});return t.db.query(sql,values);}} as typeof t.db;
  expect(await recordOpen(old,'/conga',null,null,'a'.repeat(32))).toBe(true);
  expect(await siteOpens(old,null,TZ)).toMatchObject({total:1,people:0,visitors:0});
 });
 it('says nothing was opened while the table is not there',async()=>{
  const missing={query:async()=>{throw Object.assign(new Error('relation "site_open" does not exist'),{code:'42P01'});}};
  expect(await siteOpens(missing,null,TZ)).toMatchObject({total:0,people:0,areas:[],since:null});
  await expect(siteOpens({query:async()=>{throw new Error('connection lost');}},null,TZ)).rejects.toThrow('connection lost');
 });
});

describe('what people did',()=>{
 it('counts from the rows already kept, within the time asked for',async()=>{
  const id=await signedUp('user_a');
  await t.db.query(`insert into campus_subscribe_ask(person_id,email,plan,place,asked_at) values($1,'a@cornell.edu','ink','own animal','2026-11-19T12:00:00Z'),($1,'a@cornell.edu','ink_plus','group picture','2026-10-01T12:00:00Z')`,[id]);
  const pressed=async(since:Date|null)=>(await siteActions(t.db,since)).find(each=>each.name==='Pressed Subscribe')?.times;
  expect(await pressed(null)).toBe(2);
  expect(await pressed(new Date('2026-11-01T00:00:00Z'))).toBe(1);
  expect((await siteActions(t.db,null))[0]).toEqual({name:'Pressed Subscribe',times:2});
 });
});

describe('accounts from the sign-in provider',()=>{
 const user=(over:Partial<Parameters<typeof accountOf>[0]>={})=>({id:'user_a',firstName:'Priya',lastName:'Raman',imageUrl:'https://img.example/p.png',passwordEnabled:false,createdAt:1000,lastSignInAt:2000,lastActiveAt:3000,primaryEmailAddressId:'e1',
  emailAddresses:[{id:'e1',emailAddress:'PR482@cornell.edu',verification:{strategy:'from_oauth_google'}}],externalAccounts:[{provider:'oauth_google'}],...over});
 it('reads the ways an account signs in',()=>{
  expect(waysOf(user())).toEqual(['google']);
  expect(waysOf(user({externalAccounts:[{provider:'oauth_linkedin_oidc'},{provider:'oauth_google'}]}))).toEqual(['google','linkedin']);
  expect(waysOf(user({externalAccounts:[],emailAddresses:[{id:'e1',emailAddress:'a@cornell.edu',verification:{strategy:'email_code'}}]}))).toEqual(['email']);
  expect(waysOf(user({externalAccounts:[{provider:'oauth_linkedin_oidc'}],emailAddresses:[{id:'e1',emailAddress:'a@cornell.edu',verification:{strategy:'email_code'}}]}))).toEqual(['email','linkedin']);
  expect(waysOf(user({externalAccounts:[{provider:'oauth_apple'}]}))).toEqual(['other']);
  expect(waysOf(user({externalAccounts:[],emailAddresses:[]}))).toEqual(['email']);
 });
 it('keeps the name, the primary address and the times',()=>{
  expect(accountOf(user())).toEqual({subject:'user_a',name:'Priya Raman',email:'pr482@cornell.edu',photo:'https://img.example/p.png',ways:['google'],joined:1000,lastSignIn:2000,lastActive:3000});
 });
 it('adds them up',()=>{
  const one=(over:Partial<Account>):Account=>({subject:'s',name:'',email:null,photo:'',ways:['google'],joined:0,lastSignIn:null,lastActive:null,...over});
  const all=[one({joined:Date.parse('2026-11-19'),lastActive:Date.parse('2026-11-20')}),one({ways:['email','linkedin'],joined:Date.parse('2026-10-01'),lastSignIn:Date.parse('2026-10-02')}),one({ways:['email']})];
  expect(summarise(all,new Date('2026-11-14'))).toEqual({people:3,joined:1,active:1,ways:[{way:'google',people:1},{way:'email',people:2},{way:'linkedin',people:1}]});
  expect(summarise(all,null)).toMatchObject({people:3,joined:3,active:2});
 });
 it('lists the last days, oldest first, across a month end',()=>{
  expect(lastDays('2026-11-02',4)).toEqual(['2026-10-30','2026-10-31','2026-11-01','2026-11-02']);
 });
});

describe('what Loopd knows of each account',()=>{
 it('gives the school, the picture, the plan and the days they opened a page',async()=>{
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',`pk_test_${Buffer.from('clerk.example.com$').toString('base64')}`);vi.stubEnv('LOOP_AUTH_ISSUER','');
  const a=await signedUp('user_a'),b=await signedUp('user_b');
  await t.db.query(`insert into campus_person(person_id,campus_id) select $1,id from campus where slug='cornell'`,[a]);
  await t.db.query('insert into campus_face(person_id,face) values($1,7)',[a]);
  await t.db.query(`insert into campus_ink_plus(person_id,email) values($1,'a@cornell.edu')`,[a]);
  await t.db.query(`insert into site_open(person_id,area,opened_at) values($1,'This week','2026-11-20T15:00:00Z'),($1,'Ink','2026-11-20T16:00:00Z'),($1,'Ink','2026-11-18T16:00:00Z'),($1,'Ink','2026-10-01T16:00:00Z')`,[a]);
  const facts=await personFacts(t.db,['user_a','user_b','user_unknown'],TZ,new Date('2026-11-07T00:00:00Z'));
  expect(facts.get('user_a')).toEqual({school:'Cornell',face:animal(7),ink:false,inkPlus:true,days:['2026-11-18','2026-11-20']});
  expect(facts.get('user_b')).toEqual({school:null,face:animal(animalOf(b)),ink:false,inkPlus:false,days:[]});
  expect(facts.has('user_unknown')).toBe(false);
 });
});
