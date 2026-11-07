import {generateKeyPairSync,randomUUID,verify} from 'node:crypto';
import {afterAll,afterEach,beforeAll,expect,it,vi} from 'vitest';
import {getAnnouncementSigner,withAnnouncementTestSigner} from '@/lib/emba/announcement-signer';
import {publishAnnouncement,readAnnouncement,registerAnnouncementKey,retireAnnouncementKey} from '@/lib/emba/announcements';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';

let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});
afterAll(async()=>{await t.close();});
afterEach(()=>{vi.unstubAllEnvs();});
function entry() {
  const pair=generateKeyPairSync('ed25519');
  return {orgId:randomUUID(),loopId:randomUUID(),keyId:randomUUID(),privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),pair};
}
function configure(values:{orgId:string;loopId:string;keyId:string;privateKey:string}[]) {
  vi.stubEnv('LOOP_ANNOUNCEMENT_KEYS',JSON.stringify(values.map(({orgId,loopId,keyId,privateKey})=>({orgId,loopId,keyId,privateKey}))));
}
it('signs only the configured exact scope in production without exposing private material',async()=>{
  const a=entry();configure([a]);vi.stubEnv('NODE_ENV','production');
  const signer=await getAnnouncementSigner(a);
  expect(signer?.keyId).toBe(a.keyId);
  const bytes=Buffer.from('canonical announcement');
  expect(verify(null,bytes,a.pair.publicKey,await signer!.sign(bytes))).toBe(true);
  expect(JSON.stringify(signer)).not.toContain('PRIVATE');
  expect(await getAnnouncementSigner({...a,loopId:randomUUID()})).toBeNull();
  expect(await getAnnouncementSigner({...a,orgId:randomUUID()})).toBeNull();
  expect(()=>withAnnouncementTestSigner(async()=>signer,()=>undefined)).toThrow('Test signers are disabled');
});
it('observes key rotation and removal on subsequent requests in the same process',async()=>{
  const a=entry();configure([a]);expect((await getAnnouncementSigner(a))?.keyId).toBe(a.keyId);
  const b={...entry(),orgId:a.orgId,loopId:a.loopId};configure([b]);
  const rotated=await getAnnouncementSigner(a);
  expect(rotated?.keyId).toBe(b.keyId);
  expect(verify(null,Buffer.from('rotation'),b.pair.publicKey,await rotated!.sign(Buffer.from('rotation')))).toBe(true);
  vi.stubEnv('LOOP_ANNOUNCEMENT_KEYS','');expect(await getAnnouncementSigner(a)).toBeNull();
});
it.each(['malformed','duplicate-scope','duplicate-key','wrong-algorithm','oversize','unknown-field'])('fails closed for %s configuration without secret-bearing errors',async kind=>{
  const a=entry(),b=entry();
  if(kind==='malformed')vi.stubEnv('LOOP_ANNOUNCEMENT_KEYS','RAW_SECRET_CANARY');
  else if(kind==='oversize')vi.stubEnv('LOOP_ANNOUNCEMENT_KEYS','x'.repeat(65537));
  else if(kind==='unknown-field')vi.stubEnv('LOOP_ANNOUNCEMENT_KEYS',JSON.stringify([{...a,unexpected:'RAW_SECRET_CANARY'}]));
  else {
    if(kind==='duplicate-scope'){b.orgId=a.orgId;b.loopId=a.loopId;}
    if(kind==='duplicate-key')b.keyId=a.keyId;
    if(kind==='wrong-algorithm')a.privateKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'}).toString();
    configure(kind==='wrong-algorithm'?[a]:[a,b]);
  }
  expect(await getAnnouncementSigner(a)).toBeNull();
});
it('publishes with configured custody while database key status still blocks retired or mismatched keys',async()=>{
  await t.reset();const f=await seedEmbaFixture(t.db),a={...entry(),...f.vietnam};
  const key=await registerAnnouncementKey(t.db,f.organizer,{...f.vietnam,publicKey:a.pair.publicKey.export({type:'spki',format:'pem'}).toString()});
  configure([{...a,keyId:key.id}]);
  const signer=(await getAnnouncementSigner(f.vietnam))!;
  const notice=await publishAnnouncement(t.db,f.organizer,{...f.vietnam,text:'Configured service attestation'},signer);
  expect((await readAnnouncement(t.db,f.organizer,notice.id)).verified).toBe(true);
  configure([{...entry(),...f.vietnam,keyId:key.id}]);
  await expect(publishAnnouncement(t.db,f.organizer,{...f.vietnam,text:'Wrong private key'},(await getAnnouncementSigner(f.vietnam))!)).rejects.toThrow('forbidden');
  await retireAnnouncementKey(t.db,f.organizer,key.id,'retired');
  await expect(publishAnnouncement(t.db,f.organizer,{...f.vietnam,text:'Retired'},signer)).rejects.toThrow('forbidden');
  expect((await readAnnouncement(t.db,f.organizer,notice.id)).verified).toBe(true);
  expect(JSON.stringify((await t.db.query('select * from emba_audit')).rows)).not.toContain('PRIVATE KEY');
});
