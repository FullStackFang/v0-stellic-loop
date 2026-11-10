// @vitest-environment node
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {authenticate,type Principal} from '@/lib/emba/access';
import {grantLease,revokeLease} from '@/lib/emba/consent';
import {registerGroupAddress,retireGroupAddress} from '@/lib/emba/groups';
import {applyDeletionTombstones,exportPersonalData} from '@/lib/emba/privacy';
import {grantRole,revokeMembership,revokeRole} from '@/lib/emba/roles';
import {setMemberHandle} from '@/lib/emba/tags';
import {amendRecord,claim,correctOutput,fileOutput,LIMITS,logDecision,postAnnouncement,type Saved,type WriteResult} from '@/lib/emba/team-records';

let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});afterAll(async()=>{await t?.close();});beforeEach(async()=>{await t.reset();await t.db.query('delete from emba_deletion_tombstone');});
const forever='2099-01-01T00:00:00Z';
async function fixture(){
 const f=await seedEmbaFixture(t.db);await t.db.query("update emba_role set role='owner' where person_id=$1",[f.organizer.personId]);
 const root={orgId:f.orgId,loopId:f.rootId};
 await registerGroupAddress(t.db,f.organizer,{...root,namespace:'cohort',slug:'workspace'});
 await registerGroupAddress(t.db,f.organizer,{...f.vietnam,namespace:'cohort',slug:'vietnam'});
 await setMemberHandle(t.db,f.memberA,{orgId:f.orgId,handle:'ana'});
 await setMemberHandle(t.db,f.memberB,{orgId:f.orgId,handle:'ben'});
 return {...f,root};
}
type F=Awaited<ReturnType<typeof fixture>>;
async function assistant(f:F,actions:('plan:read'|'group-memory:write')[]=['plan:read','group-memory:write'],client='claude') {
 const lease=await grantLease(t.db,f.memberA,{...f.root,clientId:client,actions,expiresAt:forever});
 const p=(await authenticate(t.db,'test',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,clientId:client,scopes:['plan:read','group-memory:write'],expiresAt:Date.parse(forever)})))!;
 return {p,lease};
}
const saved=(result:WriteResult):Saved=>{if(!result.saved)throw new Error(`not saved: ${JSON.stringify(result)}`);return result;};
const n=async(sql:string,params:unknown[]=[])=>Number((await t.db.query<{n:number}>(`select count(*)::int as n from ${sql}`,params)).rows[0].n);
const out=(f:F,extra:Record<string,unknown>={})=>({...f.root,url:'https://docs.google.com/document/d/abc',title:'Market sizing',summary:'TAM is 4.2bn; method in section 2.',decisionsVersion:0,...extra});
const ana={handle:'@cohort/ana',isYou:true,former:false},ben={handle:'@cohort/ben',isYou:false,former:false};
const uuids=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

it('files a link and returns exactly what was stored, by number and handle',async()=>{
 const f=await fixture();
 const a=saved(await fileOutput(t.db,f.memberA,out(f,{title:'Market\n sizing\u200B',url:' https://docs.google.com/document/d/abc '})));
 expect(a).toMatchObject({saved:true,replayed:false,decisionsVersion:0,also:[]});
 expect(a.record).toMatchObject({number:1,kind:'output',state:'current',version:1,event:null,by:ana,assistant:null,tags:[],
  title:'Market sizing',summary:'TAM is 4.2bn; method in section 2.',url:'https://docs.google.com/document/d/abc',host:'docs.google.com',recognisedHost:true,conflicts:[]});
 expect(JSON.stringify(a)).not.toMatch(uuids);
 // An unknown host is accepted and labelled; it is never refused for being unknown.
 const b=saved(await fileOutput(t.db,f.memberA,out(f,{url:'https://files.example.org/deck.pdf',title:'Deck'})));
 expect(b.record).toMatchObject({number:2,host:'files.example.org',recognisedHost:false});
 // Another member sees the same record without "you".
 const again=saved(await fileOutput(t.db,f.memberB,out(f,{url:'https://files.example.org/deck.pdf',title:'Deck',tags:['ana']})));
 expect(again.record).toMatchObject({number:3,by:{handle:'@cohort/ben',isYou:true},tags:[{handle:'@cohort/ana',isYou:false,former:false}]});
});
it('refuses links that are not a plain https address, and stores nothing',async()=>{
 const f=await fixture(),audits=await n("emba_audit where action='memory:write'");
 for(const [url,problem] of [['http://docs.google.com/x','not_https'],['https://user:pw@docs.google.com/x','has_login'],['https://docs.google.com:8443/x','has_port'],
  ['https://127.0.0.1/x','host_not_a_name'],['https://localhost/x','host_not_a_name'],['https://xn--80ak6aa92e.com/x','host_not_a_name'],
  ['javascript:alert(1)','not_https'],['not a link','not_a_link'],[`https://docs.google.com/${'a'.repeat(600)}`,'too_long']] as const)
  expect(await fileOutput(t.db,f.memberA,out(f,{url})),url).toEqual({saved:false,reason:'link_refused',problem});
 expect(await n('emba_team_record')).toBe(0);
 for(const bad of [{title:'x'.repeat(121)},{summary:'y'.repeat(601)},{title:'---'},{summary:''},{extra:1},{tags:['a1','b1','c1','d1','e1','f1']}])
  await expect(fileOutput(t.db,f.memberA,out(f,bad))).rejects.toThrow();
 expect(await n('emba_team_record')).toBe(0);
 expect(await n("emba_audit where action='memory:write'")).toBe(audits);
});
it('replaces an output, closes a claim with it, and corrects it with a version check',async()=>{
 const f=await fixture();
 const first=saved(await fileOutput(t.db,f.memberA,out(f)));
 const mine=saved(await claim(t.db,f.memberA,{...f.root,what:'Write the market sizing'}));
 const next=saved(await fileOutput(t.db,f.memberA,out(f,{title:'Market sizing v2',replaces:1,closesClaim:2})));
 expect(next.record).toMatchObject({number:3,state:'current',title:'Market sizing v2'});
 expect(next.also).toEqual([expect.objectContaining({number:1,state:'replaced',replacedBy:3}),expect.objectContaining({number:2,claimStatus:'done'})]);
 // Replacing or closing something that already moved on saves nothing.
 expect(await fileOutput(t.db,f.memberA,out(f,{title:'v3',replaces:1}))).toMatchObject({saved:false,reason:'stale',current:{number:1,state:'replaced'}});
 expect(await fileOutput(t.db,f.memberA,out(f,{title:'v3',closesClaim:2}))).toMatchObject({saved:false,reason:'stale',current:{claimStatus:'done'}});
 expect(await fileOutput(t.db,f.memberA,out(f,{title:'v3',replaces:99}))).toEqual({saved:false,reason:'unknown_reference',kind:'output',value:'99'});
 // Only the author corrects. (Any member may replace: tested below.)
 await expect(correctOutput(t.db,f.memberB,out(f,{number:3,expectedVersion:1}))).rejects.toThrow('forbidden');
 const fixed=saved(await correctOutput(t.db,f.memberA,out(f,{number:3,expectedVersion:1,title:'Market sizing v2 (fixed)'})));
 expect(fixed.record).toMatchObject({number:3,version:2,title:'Market sizing v2 (fixed)'});
 expect(await correctOutput(t.db,f.memberA,out(f,{number:3,expectedVersion:1,title:'Late'}))).toMatchObject({saved:false,reason:'stale',current:{version:2,title:'Market sizing v2 (fixed)'}});
 expect(first.record.number).toBe(1);expect(mine.record).toMatchObject({kind:'claim',claimStatus:'open',owner:ana});
 expect(await n('emba_team_record')).toBe(3);
 // Any member may file the output that replaces another's.
 expect(saved(await fileOutput(t.db,f.memberB,out(f,{title:'Ben takes over',replaces:3}))).also).toEqual([expect.objectContaining({number:3,state:'replaced',replacedBy:4})]);
 // A link far too long is named as such, not thrown.
 expect(await fileOutput(t.db,f.memberA,out(f,{url:`https://docs.google.com/${'a'.repeat(2100)}`}))).toEqual({saved:false,reason:'link_refused',problem:'too_long'});
});
it('removes the text and link from every version on withdrawal',async()=>{
 const f=await fixture();
 saved(await fileOutput(t.db,f.memberA,out(f)));
 saved(await correctOutput(t.db,f.memberA,out(f,{number:1,expectedVersion:1,title:'Second'})));
 await expect(amendRecord(t.db,f.memberB,{...f.root,number:1,action:'withdraw'})).rejects.toThrow('forbidden');
 const gone=saved(await amendRecord(t.db,f.memberA,{...f.root,number:1,action:'withdraw'}));
 expect(gone.record).toEqual({number:1,kind:'output',state:'withdrawn',version:2,event:null,by:ana,assistant:null,createdAt:expect.any(String),tags:[]});
 expect(await n('emba_team_record_version where title is not null or body is not null or url is not null')).toBe(0);
 expect(await n('emba_team_record_version where withdrawn')).toBe(2);
 expect(await amendRecord(t.db,f.memberA,{...f.root,number:1,action:'withdraw',operationId:'00000000-0000-4000-8000-000000000901'})).toMatchObject({saved:false,reason:'stale'});
 // An organizer can withdraw another member's record.
 saved(await fileOutput(t.db,f.memberA,out(f,{title:'Another'})));
 expect(saved(await amendRecord(t.db,f.organizer,{...f.root,number:2,action:'withdraw'})).record.state).toBe('withdrawn');
});
it('keeps one current decision per topic: declared new, superseded by name, never corrected',async()=>{
 const f=await fixture();
 const decision={...f.root,topic:'deck-tool',statement:'We build the deck in Google Slides.'};
 expect(await logDecision(t.db,f.memberA,decision)).toEqual({saved:false,reason:'new_topic_unconfirmed',topics:[]});
 const first=saved(await logDecision(t.db,f.memberA,{...decision,newTopic:true}));
 expect(first).toMatchObject({decisionsVersion:1,record:{number:1,kind:'decision',state:'current',topic:'deck-tool',statement:'We build the deck in Google Slides.',by:ana}});
 expect(await logDecision(t.db,f.memberB,{...decision,statement:'Canva.',newTopic:true})).toEqual({saved:false,reason:'topic_exists',current:{number:1,topic:'deck-tool',statement:'We build the deck in Google Slides.'}});
 expect(await logDecision(t.db,f.memberB,{...decision,statement:'Canva.'})).toMatchObject({saved:false,reason:'stale',current:{number:1}});
 expect(await logDecision(t.db,f.memberB,{...f.root,topic:'deck-font',statement:'Inter.'})).toEqual({saved:false,reason:'new_topic_unconfirmed',topics:[{number:1,topic:'deck-tool',statement:'We build the deck in Google Slides.'}]});
 const second=saved(await logDecision(t.db,f.memberB,{...decision,statement:'We build the deck in Canva.',supersedes:1}));
 expect(second).toMatchObject({decisionsVersion:2,record:{number:2,state:'current',statement:'We build the deck in Canva.'},also:[{number:1,state:'superseded',supersededBy:2,statement:'We build the deck in Google Slides.'}]});
 // A second writer still holding number 1 loses, and is shown what is current.
 expect(await logDecision(t.db,f.memberA,{...decision,statement:'Keynote.',supersedes:1})).toMatchObject({saved:false,reason:'stale',current:{number:2,statement:'We build the deck in Canva.'}});
 // A decision is not an output: it cannot be corrected.
 expect(await correctOutput(t.db,f.memberB,out(f,{number:2,expectedVersion:1,decisionsVersion:2}))).toEqual({saved:false,reason:'unknown_reference',kind:'output',value:'2'});
 // Withdrawn with no successor: the topic is free again.
 expect(saved(await amendRecord(t.db,f.memberB,{...f.root,number:2,action:'withdraw'}))).toMatchObject({decisionsVersion:3,record:{number:2,state:'withdrawn'}});
 expect(await logDecision(t.db,f.memberA,{...decision,supersedes:2})).toEqual({saved:false,reason:'stale',current:null});
 expect(saved(await logDecision(t.db,f.memberA,{...decision,newTopic:true})).record).toMatchObject({number:3,state:'current'});
 await expect(logDecision(t.db,f.memberA,{...decision,newTopic:true,supersedes:3})).rejects.toThrow();
 await expect(logDecision(t.db,f.memberA,{...decision,topic:'everyone',newTopic:true})).rejects.toThrow();
 await expect(logDecision(t.db,f.memberA,{...decision,statement:'x'.repeat(401),supersedes:3})).rejects.toThrow();
});
it('records a claim for yourself as open and for someone else as proposed until they answer',async()=>{
 const f=await fixture();
 const own=saved(await claim(t.db,f.memberA,{...f.root,what:'Slides 1 to 5',dueOn:'2026-11-20'}));
 expect(own.record).toMatchObject({number:1,kind:'claim',what:'Slides 1 to 5',owner:ana,by:ana,dueOn:'2026-11-20',claimStatus:'open',overlaps:[]});
 const forBen=saved(await claim(t.db,f.memberA,{...f.root,what:'Slides 4 to 8',owner:'ben',overlapsWith:[1]}));
 expect(forBen.record).toMatchObject({number:2,owner:ben,by:ana,claimStatus:'proposed',overlaps:[1]});
 expect(forBen.also).toEqual([expect.objectContaining({number:1,overlaps:[2]})]);
 // Only the person it was proposed for answers.
 await expect(amendRecord(t.db,f.memberA,{...f.root,number:2,action:'confirm'})).rejects.toThrow('forbidden');
 expect(await amendRecord(t.db,f.memberA,{...f.root,number:2,action:'done'})).toMatchObject({saved:false,reason:'stale'});
 expect(saved(await amendRecord(t.db,f.memberB,{...f.root,number:2,action:'confirm'})).record).toMatchObject({claimStatus:'open',owner:{isYou:true}});
 expect(await amendRecord(t.db,f.memberB,{...f.root,number:2,action:'decline'})).toMatchObject({saved:false,reason:'stale',current:{claimStatus:'open'}});
 // Done or released by the owner, the recorder, or an organizer; nobody else.
 await expect(amendRecord(t.db,f.members[2],{...f.root,number:2,action:'done'})).rejects.toThrow('forbidden');
 expect(saved(await amendRecord(t.db,f.memberA,{...f.root,number:2,action:'done'})).record.claimStatus).toBe('done');
 expect(saved(await amendRecord(t.db,f.organizer,{...f.root,number:1,action:'release'})).record).toMatchObject({claimStatus:'released',overlaps:[]});
 const third=saved(await claim(t.db,f.memberA,{...f.root,what:'Appendix',owner:'ben'}));
 expect(saved(await amendRecord(t.db,f.memberB,{...f.root,number:third.record.number,action:'decline'})).record.claimStatus).toBe('declined');
 // The owner must be a current teammate with a handle; an overlap must name a live claim.
 expect(await claim(t.db,f.memberA,{...f.root,what:'Ghost work',owner:'ghost'})).toEqual({saved:false,reason:'unknown_reference',kind:'person',value:'ghost'});
 expect(await claim(t.db,f.memberA,{...f.root,what:'More',overlapsWith:[1]})).toEqual({saved:false,reason:'unknown_reference',kind:'claim',value:'1'});
 await expect(claim(t.db,f.memberA,{...f.root,what:'x'.repeat(201)})).rejects.toThrow();
 await expect(claim(t.db,f.memberA,{...f.root,what:'Bad date',dueOn:'2026-02-30'})).rejects.toThrow();
 expect(await n('emba_team_record')).toBe(3);
});
it('checks conflicts before every output save and keeps a filed disagreement visible',async()=>{
 const f=await fixture();
 saved(await logDecision(t.db,f.memberA,{...f.root,topic:'deck-tool',statement:'Google Slides.',newTopic:true}));
 const held=[{number:1,topic:'deck-tool',statement:'Google Slides.'}];
 // No version, or an old one: nothing saved, and the current decisions come back.
 expect(await fileOutput(t.db,f.memberB,out(f,{decisionsVersion:undefined}))).toEqual({saved:false,reason:'decisions_needed',decisionsVersion:1,decisions:held});
 expect(await fileOutput(t.db,f.memberB,out(f))).toEqual({saved:false,reason:'decisions_needed',decisionsVersion:1,decisions:held});
 expect(await fileOutput(t.db,f.memberB,out(f,{decisionsVersion:1,conflictsWith:['no-such-topic']}))).toEqual({saved:false,reason:'unknown_reference',kind:'decision',value:'no-such-topic'});
 // A reported conflict saves nothing but a content-free count, once per identical report.
 const report=out(f,{decisionsVersion:1,conflictsWith:['deck-tool'],title:'Deck in Canva'});
 expect(await fileOutput(t.db,f.memberB,report)).toEqual({saved:false,reason:'conflict_reported',decisionsVersion:1,decisions:held});
 expect(await fileOutput(t.db,f.memberB,report)).toMatchObject({reason:'conflict_reported'});
 expect(await n('emba_team_record where kind=$1',['output'])).toBe(0);
 expect((await t.db.query('select decisions,person_id is not null as known from emba_team_conflict_report')).rows).toEqual([{decisions:1,known:true}]);
 // Filed anyway: saved and flagged.
 const filed=saved(await fileOutput(t.db,f.memberB,{...report,conflictsWith:[1],fileAnyway:true}));
 expect(filed.record).toMatchObject({number:2,conflicts:[{decision:1,topic:'deck-tool',state:'flagged'}]});
 // A correction that still names the conflict keeps the flag; superseding the decision asks for a re-check.
 expect(saved(await correctOutput(t.db,f.memberB,{...report,number:2,expectedVersion:1,conflictsWith:[1],fileAnyway:true,summary:'Still Canva.'})).record.conflicts).toEqual([{decision:1,topic:'deck-tool',state:'flagged'}]);
 const moved=saved(await logDecision(t.db,f.memberA,{...f.root,topic:'deck-tool',statement:'Slides, exported to PDF.',supersedes:1}));
 expect(moved.decisionsVersion).toBe(2);
 expect(await correctOutput(t.db,f.memberB,{...report,number:2,expectedVersion:2,conflictsWith:[]})).toMatchObject({saved:false,reason:'decisions_needed',decisionsVersion:2});
 expect((await t.db.query('select state from emba_team_conflict')).rows).toEqual([{state:'recheck'}]);
 // Only a correction that reports no conflict clears it.
 expect(saved(await correctOutput(t.db,f.memberB,{...report,number:2,expectedVersion:2,decisionsVersion:2,conflictsWith:[],title:'Deck in Slides'})).record.conflicts).toEqual([]);
 // A new decision can name the filed outputs it contradicts.
 const strict=saved(await logDecision(t.db,f.memberA,{...f.root,topic:'deck-length',statement:'Ten slides at most.',newTopic:true,conflictsWithOutputs:[2]}));
 expect(strict.also).toEqual([expect.objectContaining({number:2,conflicts:[{decision:strict.record.number,topic:'deck-length',state:'flagged'}]})]);
 expect(await logDecision(t.db,f.memberA,{...f.root,topic:'deck-font',statement:'Inter.',newTopic:true,conflictsWithOutputs:[1]})).toEqual({saved:false,reason:'unknown_reference',kind:'output',value:'1'});
 // Withdrawing the flagged output removes its flags.
 saved(await amendRecord(t.db,f.memberB,{...f.root,number:2,action:'withdraw'}));
 expect(await n('emba_team_conflict')).toBe(0);
});
it('tags current teammates by handle, and lets a person remove a tag on themselves',async()=>{
 const f=await fixture();
 const tagged=saved(await claim(t.db,f.memberA,{...f.root,what:'Review the numbers',tags:['ben','ben']}));
 expect(tagged.record.tags).toEqual([ben]);
 // An unknown handle saves nothing at all, even though the record had been written when it was found.
 expect(await fileOutput(t.db,f.memberA,out(f,{tags:['ben','ghost']}))).toEqual({saved:false,reason:'unknown_reference',kind:'person',value:'ghost'});
 expect(await n('emba_team_record')).toBe(1);
 expect((await t.db.query('select record_seq as n from emba_team_state')).rows).toEqual([{n:1}]);
 expect(await amendRecord(t.db,f.memberA,{...f.root,number:1,action:'untag'})).toMatchObject({saved:false,reason:'stale'});
 expect(saved(await amendRecord(t.db,f.memberB,{...f.root,number:1,action:'untag'})).record.tags).toEqual([]);
 expect((await t.db.query('select action from emba_team_change order by seq')).rows.map(row=>row.action)).toEqual(['claimed','tagged','untagged']);
});
it('lets an assistant write only under a current write grant, and names the assistant',async()=>{
 const f=await fixture();
 const reader=await assistant(f,['plan:read'],'reader');
 await expect(fileOutput(t.db,reader.p,out(f))).rejects.toThrow('forbidden');
 const writer=await assistant(f);
 const filed=saved(await fileOutput(t.db,writer.p,out(f)));
 expect(filed.record).toMatchObject({by:ana,assistant:'claude'});
 expect((await t.db.query("select client_id,lease_id is not null as leased from emba_audit where action='memory:write' and client_id is not null")).rows).toEqual([{client_id:'claude',leased:true}]);
 // The grant is for one team; another team, a non-member and a revoked grant are all refused.
 await expect(fileOutput(t.db,writer.p,out(f,{...f.vietnam}))).rejects.toThrow('forbidden');
 await expect(fileOutput(t.db,f.nonmember,out(f))).rejects.toThrow('forbidden');
 await expect(postAnnouncement(t.db,writer.p,{...f.root,text:'From an assistant'})).rejects.toThrow('forbidden');
 await expect(postAnnouncement(t.db,f.memberA,{...f.root,text:'From a member'})).rejects.toThrow('forbidden');
 await revokeLease(t.db,f.memberA,writer.lease.id);
 await expect(claim(t.db,writer.p,{...f.root,what:'After revocation'})).rejects.toThrow('forbidden');
 expect(saved(await postAnnouncement(t.db,f.organizer,{...f.root,text:'Deck due Friday.'})).record).toMatchObject({kind:'announcement',text:'Deck due Friday.',by:{handle:null,isYou:true}});
 // A retired team address takes no writes.
 await retireGroupAddress(t.db,f.organizer,f.root);
 await expect(fileOutput(t.db,f.memberA,out(f,{title:'Late'}))).rejects.toThrow('forbidden');
 expect(await n('emba_team_record')).toBe(2);
});
it('returns the stored record on a retry instead of writing twice',async()=>{
 const f=await fixture();
 const operationId='00000000-0000-4000-8000-000000000777';
 const first=saved(await claim(t.db,f.memberA,{...f.root,what:'Slides 1 to 5',operationId}));
 expect(saved(await claim(t.db,f.memberA,{...f.root,what:'Slides 1 to 5',operationId}))).toMatchObject({replayed:true,record:{number:first.record.number}});
 // The same id with different content is refused, not merged.
 await expect(claim(t.db,f.memberA,{...f.root,what:'Slides 6 to 9',operationId})).rejects.toThrow('conflict');
 // Without an id, an identical write from the same person and assistant within ten minutes is a retry.
 saved(await fileOutput(t.db,f.memberA,out(f)));
 expect(saved(await fileOutput(t.db,f.memberA,out(f)))).toMatchObject({replayed:true,record:{number:2}});
 expect(saved(await fileOutput(t.db,f.memberB,out(f))).record.number).toBe(3);
 // Once the record has changed, the same words are a new write, not a retry.
 saved(await claim(t.db,f.memberB,{...f.root,what:'Appendix'}));
 saved(await amendRecord(t.db,f.memberB,{...f.root,number:4,action:'release'}));
 expect(saved(await claim(t.db,f.memberB,{...f.root,what:'Appendix'}))).toMatchObject({replayed:false,record:{number:5,claimStatus:'open'}});
 // A retry shows the record as it stands now.
 saved(await amendRecord(t.db,f.memberA,{...f.root,number:1,action:'done'}));
 expect(saved(await claim(t.db,f.memberA,{...f.root,what:'Slides 1 to 5',operationId})).record.claimStatus).toBe('done');
 await t.db.query("update emba_team_operation set at=at-interval '11 minutes'");
 expect(saved(await fileOutput(t.db,f.memberA,out(f)))).toMatchObject({replayed:false,record:{number:6}});
 expect(await n('emba_team_record')).toBe(6);
});
it('caps writes per person and assistant per hour, and open claims per team',async()=>{
 const f=await fixture();
 for(let i=0;i<LIMITS.writesPerHour;i++)saved(await claim(t.db,f.memberA,{...f.root,what:`Task ${i}`}));
 expect(await claim(t.db,f.memberA,{...f.root,what:'One too many'})).toEqual({saved:false,reason:'cap',cap:'writes_per_hour'});
 // The cap is per person and assistant: the same person through an assistant, and another member, still write.
 const writer=await assistant(f);
 saved(await claim(t.db,writer.p,{...f.root,what:'Through the assistant'}));
 saved(await claim(t.db,f.memberB,{...f.root,what:'Another member'}));
 // Team cap on open and proposed claims.
 const people:Principal[]=[f.memberA,f.memberB,f.members[2],f.members[3]];
 let open=await n("emba_team_record where claim_status in ('open','proposed')");
 for(let i=0;open<LIMITS.openClaims;i++,open++){
  if(i%20===0)await t.db.query("update emba_team_operation set at=at-interval '2 hours'");
  saved(await claim(t.db,people[i%4],{...f.root,what:`Bulk ${i}`}));
 }
 await t.db.query("update emba_team_operation set at=at-interval '2 hours'");
 expect(await claim(t.db,f.members[4],{...f.root,what:'Over the team cap'})).toEqual({saved:false,reason:'cap',cap:'open_claims'});
 saved(await amendRecord(t.db,f.memberA,{...f.root,number:1,action:'done'}));
 expect(saved(await claim(t.db,f.members[4],{...f.root,what:'Room again'})).record.claimStatus).toBe('open');
},180000);

async function holdings(f:F) {
 // Ben owns an open claim (1), has one proposed for him (2), recorded one for Ana (3), filed an output (4) and is tagged on Ana's claim (5).
 saved(await claim(t.db,f.memberB,{...f.root,what:'Slides 1 to 5'}));
 saved(await claim(t.db,f.memberA,{...f.root,what:'Appendix',owner:'ben'}));
 saved(await claim(t.db,f.memberB,{...f.root,what:'Intro',owner:'ana'}));
 saved(await fileOutput(t.db,f.memberB,out(f)));
 saved(await claim(t.db,f.memberA,{...f.root,what:'Review',tags:['ben']}));
}
const statuses=async()=>(await t.db.query('select number,claim_status as status from emba_team_record where kind=$1 order by number',['claim'])).rows;
it('releases what a removed member was holding and keeps what they wrote',async()=>{
 const f=await fixture();await holdings(f);
 await revokeMembership(t.db,f.organizer,{orgId:f.orgId,personId:f.memberB.personId});
 expect(await statuses()).toEqual([{number:1,status:'released'},{number:2,status:'declined'},{number:3,status:'proposed'},{number:5,status:'open'}]);
 expect(await n('emba_team_record_tag')).toBe(0);
 expect((await t.db.query('select action from emba_team_change order by seq desc limit 3')).rows.map(row=>row.action).sort()).toEqual(['declined','released','untagged']);
 // The output stays, attributed to someone who is no longer on the team; the old handle is not shown and cannot be used.
 const seen=saved(await amendRecord(t.db,f.memberA,{...f.root,number:3,action:'confirm'}));
 expect(seen.record).toMatchObject({number:3,claimStatus:'open',by:{handle:null,isYou:false,former:true}});
 expect(await claim(t.db,f.memberA,{...f.root,what:'For Ben again',owner:'ben'})).toEqual({saved:false,reason:'unknown_reference',kind:'person',value:'ben'});
 await expect(claim(t.db,f.memberB,{...f.root,what:'After leaving'})).rejects.toThrow('forbidden');
 expect(await n('emba_team_record where author_id=$1',[f.memberB.personId])).toBe(3);
});
it('unlinks a deleted account from team history, and exports claims, receipts and handle without record text',async()=>{
 const f=await fixture();await holdings(f);
 const fresh=(await authenticate(t.db,'test',async()=>({issuer:f.memberB.issuer,subject:f.memberB.subject,expiresAt:Date.parse(forever),authenticatedAt:Date.now()})))!;
 const exported=await exportPersonalData(t.db,fresh);
 expect(exported.handles).toEqual([{org_id:f.orgId,handle:'ben'}]);
 expect(exported.teamClaims).toMatchObject([{number:1,claim_status:'open',owner:true,recorder:true},{number:2,claim_status:'proposed',owner:true,recorder:false},{number:3,claim_status:'proposed',owner:false,recorder:true}]);
 expect(exported.teamReceipts).toMatchObject([{number:1,kind:'claim'},{number:3,kind:'claim'},{number:4,kind:'output'}]);
 expect(JSON.stringify([exported.teamClaims,exported.teamReceipts])).not.toMatch(/Slides|Appendix|Intro|Market|docs.google/);
 await applyDeletionTombstones(t.db,[f.memberB.personId]);
 expect(await statuses()).toEqual([{number:1,status:'released'},{number:2,status:'declined'},{number:3,status:'proposed'},{number:5,status:'open'}]);
 const id=[f.memberB.personId];
 expect(await n('emba_team_record_tag where person_id=$1',id)).toBe(0);
 expect(await n('emba_team_operation where person_id=$1',id)).toBe(0);
 expect(await n('emba_team_change where actor_id=$1 or subject_id=$1',id)).toBe(0);
 expect(await n('emba_team_record_version where edited_by=$1',id)).toBe(0);
 expect(await n('emba_member_handle where person_id=$1',id)).toBe(0);
 expect(await n('emba_team_record where owner_id=$1',id)).toBe(0);
 // Records they wrote stay with the team, shown as written by a former teammate.
 expect(saved(await amendRecord(t.db,f.memberA,{...f.root,number:3,action:'confirm'})).record).toMatchObject({by:{handle:null,isYou:false,former:true},owner:ana});
 expect(await n('emba_team_record_version v join emba_team_record r on r.id=v.record_id where r.number=4 and v.url is not null')).toBe(1);
});

// Findings from the section 2 review (2026-11-10).
it('needs read consent as well as write, and records a declined write that showed team records as a read',async()=>{
 const f=await fixture();
 saved(await logDecision(t.db,f.memberB,{...f.root,topic:'deck-tool',statement:'Google Slides.',newTopic:true}));
 const writeOnly=await assistant(f,['group-memory:write'],'write-only');
 await expect(fileOutput(t.db,writeOnly.p,out(f,{decisionsVersion:undefined}))).rejects.toThrow('forbidden');
 await expect(amendRecord(t.db,writeOnly.p,{...f.root,number:1,action:'untag'})).rejects.toThrow('forbidden');
 const writer=await assistant(f);
 const reads=()=>n("emba_audit where action='plan:read' and client_id='claude' and resource_id=$1",[f.rootId]);
 const before=await reads();
 expect(await fileOutput(t.db,writer.p,out(f,{decisionsVersion:undefined}))).toMatchObject({reason:'decisions_needed'});
 expect(await reads()).toBe(before+1);
});
it('turns input the database would refuse into a plain invalid-input error that quotes nothing',async()=>{
 const f=await fixture();
 // Characters the storage rules refuse are removed by the cleaner, not passed on to fail.
 const odd=saved(await fileOutput(t.db,f.memberA,out(f,{title:'Secret plan\u2065 text \u{E0002}\uE000\uFFFF\u2800\uFFFC end'})));
 expect(odd.record.title).toBe('Secret plan text end');
 for(const dueOn of ['0000-01-01','1999-12-31','2200-01-01']){
  const error=await claim(t.db,f.memberA,{...f.root,what:'Secret plan',dueOn}).catch(caught=>caught as Error);
  expect(error).toBeInstanceOf(Error);expect(String((error as Error).message)).not.toContain('Secret plan');
 }
 // An assistant whose name is not plain printable text writes nothing.
 const strange=await assistant(f,['plan:read','group-memory:write'],'Cl\u00E4\u00FCde');
 await expect(claim(t.db,strange.p,{...f.root,what:'Work'})).rejects.toThrow('forbidden');
 expect(await n("emba_team_record where kind='claim'")).toBe(0);
});
it('lets go of what a person held when they lose write access to one team, not only the organization',async()=>{
 const f=await fixture();await holdings(f);
 saved(await claim(t.db,f.memberB,{...f.root,what:'For Ana as well',owner:'ana',tags:['ana']}));
 await revokeRole(t.db,f.organizer,{...f.root,personId:f.memberB.personId});
 expect(await statuses()).toEqual([{number:1,status:'released'},{number:2,status:'declined'},{number:3,status:'proposed'},{number:5,status:'open'},{number:6,status:'proposed'}]);
 expect(await n('emba_team_record_tag where person_id=$1',[f.memberB.personId])).toBe(0);
 // Still a member of the organization, with a handle, but not shown as a teammate here.
 expect(saved(await amendRecord(t.db,f.memberA,{...f.root,number:3,action:'confirm'})).record.by).toEqual({handle:null,isYou:false,former:true});
 // A change to follower does the same.
 await grantRole(t.db,f.organizer,{...f.root,personId:f.memberA.personId,role:'follower'});
 expect(await statuses()).toEqual([{number:1,status:'released'},{number:2,status:'declined'},{number:3,status:'released'},{number:5,status:'released'},{number:6,status:'declined'}]);
 expect(await n('emba_team_record_tag')).toBe(0);
 // Someone who keeps write access keeps what they hold.
 saved(await claim(t.db,f.members[2],{...f.root,what:'Mine'}));
 await grantRole(t.db,f.organizer,{...f.root,personId:f.members[2].personId,role:'organizer'});
 expect((await statuses()).at(-1)).toEqual({number:7,status:'open'});
});
it('keeps a conflict flag through a correction that still reports a conflict',async()=>{
 const f=await fixture();
 saved(await logDecision(t.db,f.memberA,{...f.root,topic:'deck-tool',statement:'Google Slides.',newTopic:true}));
 saved(await logDecision(t.db,f.memberA,{...f.root,topic:'deck-font',statement:'Inter.',newTopic:true}));
 const report=out(f,{decisionsVersion:2,fileAnyway:true});
 // The same decision named twice is one conflict.
 expect(saved(await fileOutput(t.db,f.memberB,{...report,conflictsWith:['deck-tool',1]})).record.conflicts).toEqual([{decision:1,topic:'deck-tool',state:'flagged'}]);
 const corrected=saved(await correctOutput(t.db,f.memberB,{...report,number:3,expectedVersion:1,conflictsWith:['deck-font'],summary:'Now also the wrong font.'}));
 expect(corrected.record.conflicts).toEqual([{decision:1,topic:'deck-tool',state:'flagged'},{decision:2,topic:'deck-font',state:'flagged'}]);
 // A withdrawn decision's topic key is no longer shown, on the record or on a flag that names it.
 const gone=saved(await amendRecord(t.db,f.memberA,{...f.root,number:1,action:'withdraw'}));
 expect(JSON.stringify(gone.record)).not.toContain('deck-tool');
 expect((await t.db.query("select c.state from emba_team_conflict c join emba_team_record d on d.id=c.decision_id where d.number=1")).rows).toEqual([{state:'recheck'}]);
});
it('gives an organizer authority over other people\'s records on the site only, never through an assistant',async()=>{
 const f=await fixture();
 saved(await claim(t.db,f.memberB,{...f.root,what:'Slides'}));
 saved(await postAnnouncement(t.db,f.organizer,{...f.root,text:'Deck due Friday.'}));
 await t.db.query("update emba_role set role='organizer' where person_id=$1",[f.memberA.personId]);
 const writer=await assistant(f);
 await expect(amendRecord(t.db,writer.p,{...f.root,number:1,action:'withdraw'})).rejects.toThrow('forbidden');
 await expect(amendRecord(t.db,writer.p,{...f.root,number:1,action:'release'})).rejects.toThrow('forbidden');
 await expect(amendRecord(t.db,writer.p,{...f.root,number:2,action:'withdraw'})).rejects.toThrow('forbidden');
 expect(saved(await amendRecord(t.db,f.memberA,{...f.root,number:1,action:'release'})).record.claimStatus).toBe('released');
 // A record number belongs to one team: the same number on another team names nothing.
 expect(await amendRecord(t.db,f.memberA,{...f.vietnam,number:1,action:'withdraw'})).toEqual({saved:false,reason:'unknown_reference',kind:'record',value:'1'});
});

// Final review 5.3a.
it('lets go of a claim when it is withdrawn, so no owner link outlives the person',async()=>{
 const f=await fixture();
 saved(await claim(t.db,f.memberB,{...f.root,what:'Intro'}));
 saved(await claim(t.db,f.memberA,{...f.root,what:'Appendix',owner:'ben'}));
 saved(await amendRecord(t.db,f.memberB,{...f.root,number:1,action:'withdraw'}));
 saved(await amendRecord(t.db,f.memberA,{...f.root,number:2,action:'withdraw'}));
 expect((await t.db.query('select number,state,claim_status as status from emba_team_record order by number')).rows).toEqual([{number:1,state:'withdrawn',status:'released'},{number:2,state:'withdrawn',status:'declined'}]);
 await applyDeletionTombstones(t.db,[f.memberB.personId]);
 expect((await t.db.query('select 1 from emba_team_record where owner_id=$1',[f.memberB.personId])).rows).toHaveLength(0);
});
