import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it,vi } from 'vitest';
import { openTestDb, makePerson, type TestDb } from '@/test/db';
import { authenticate } from '@/lib/emba/access';
import { registerAnnouncementKey, retireAnnouncementKey, publishAnnouncement, readAnnouncement, verifyAnnouncement } from '@/lib/emba/announcements';
import type {Db} from '@/lib/db';

describe('EMBA service-attested announcements',()=>{
  let t:TestDb;
  beforeAll(async()=>{t=await openTestDb();});
  afterAll(async()=>{await t?.close();});
  beforeEach(async()=>{await t.reset();});
  async function fixture() {
    const person=await makePerson(t.db);
    await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values ('announcement-test',$1,$2,now())",[person.id,person.id]);
    const principal=(await authenticate(t.db,'credential',async()=>({issuer:'announcement-test',subject:person.id,expiresAt:Date.parse('2099-01-01')})))!;
    const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values ('trip') returning id");
    const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values ($1,'trip') returning id",[org.id]);
    await t.db.query('insert into emba_membership(org_id,person_id) values ($1,$2)',[org.id,person.id]);
    await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values ($1,$2,$3,'owner')",[org.id,loop.id,person.id]);
    const pair=generateKeyPairSync('ed25519');
    const publicKey=pair.publicKey.export({type:'spki',format:'pem'}).toString();
    const key=await registerAnnouncementKey(t.db,principal,{orgId:org.id,loopId:loop.id,publicKey});
    const signer={keyId:key.id,sign:async(bytes:Buffer)=>sign(null,bytes,pair.privateKey)};
    return {principal,orgId:org.id,loopId:loop.id,key,publicKey,signer};
  }
  it('binds content destination version and author and rejects tampering',async()=>{
    const a=await fixture();
    const announcement=await publishAnnouncement(t.db,a.principal,{orgId:a.orgId,loopId:a.loopId,text:'Bus departure 09:00'},a.signer);
    const published=await readAnnouncement(t.db,a.principal,announcement.id,1);
    expect(published).toMatchObject({verified:true,attestation:'service-attested',untrusted:true});
    expect(verifyAnnouncement(published.envelope,published.text,published.signature,a.publicKey)).toBe(true);
    expect(verifyAnnouncement({...published.envelope,loopId:randomUUID()},published.text,published.signature,a.publicKey)).toBe(false);
    expect(verifyAnnouncement({...published.envelope,version:2},published.text,published.signature,a.publicKey)).toBe(false);
    expect(verifyAnnouncement(published.envelope,'Tampered',published.signature,a.publicKey)).toBe(false);
  });
  it('stores only canonical public SPKI material even if registration receives a private PEM',async()=>{
    const a=await fixture(),pair=generateKeyPairSync('ed25519');
    const privatePem=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
    const expectedPublic=pair.publicKey.export({type:'spki',format:'pem'}).toString();
    const registered=await registerAnnouncementKey(t.db,a.principal,{orgId:a.orgId,loopId:a.loopId,publicKey:privatePem});
    const {rows:[stored]}=await t.db.query<{public_key:string}>('select public_key from emba_announcement_key where id=$1',[registered.id]);
    expect(stored.public_key).toBe(expectedPublic);
    expect(stored.public_key).not.toContain('PRIVATE KEY');
    expect(JSON.stringify((await t.db.query('select * from emba_audit')).rows)).not.toContain(privatePem);
    const published=await publishAnnouncement(t.db,a.principal,{orgId:a.orgId,loopId:a.loopId,text:'Public verification only'},{keyId:registered.id,sign:async bytes=>sign(null,bytes,pair.privateKey)});
    expect((await readAnnouncement(t.db,a.principal,published.id)).verified).toBe(true);
  });
  // PGlite shares the JS clock; this needs a separate PostgreSQL process.
  it.skipIf(process.env.QB_DB!=='remote')('uses the database clock for signatures despite application clock skew',async()=>{
    const a=await fixture();
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2000-01-01T00:00:00Z'));
    try {
      const saved=await publishAnnouncement(t.db,a.principal,{orgId:a.orgId,loopId:a.loopId,text:'Clock-safe notice'},a.signer);
      expect((await readAnnouncement(t.db,a.principal,saved.id)).verified).toBe(true);
      await retireAnnouncementKey(t.db,a.principal,a.key.id,'retired');
      expect((await readAnnouncement(t.db,a.principal,saved.id)).verified).toBe(true);
    } finally {vi.useRealTimers();}
  });
  it('keeps corrections immutable and preserves retired-key history while warning on compromise',async()=>{
    const a=await fixture();
    const first=await publishAnnouncement(t.db,a.principal,{orgId:a.orgId,loopId:a.loopId,text:'Original'},a.signer);
    await publishAnnouncement(t.db,a.principal,{orgId:a.orgId,loopId:a.loopId,text:'Correction',announcementId:first.id,expectedVersion:1},a.signer);
    expect((await readAnnouncement(t.db,a.principal,first.id,1)).text).toBe('Original');
    await retireAnnouncementKey(t.db,a.principal,a.key.id,'retired');
    expect((await readAnnouncement(t.db,a.principal,first.id,1)).verified).toBe(true);
    await expect(publishAnnouncement(t.db,a.principal,{orgId:a.orgId,loopId:a.loopId,text:'late'},a.signer)).rejects.toThrow('forbidden');
    await retireAnnouncementKey(t.db,a.principal,a.key.id,'compromised');
    expect(await readAnnouncement(t.db,a.principal,first.id,1)).toMatchObject({verified:false,keyStatus:'compromised'});
  });
  it('reauthorizes publishing after signing and rejects a mismatched service key',async()=>{
    const a=await fixture(), b=generateKeyPairSync('ed25519');
    await expect(publishAnnouncement(t.db,a.principal,{orgId:a.orgId,loopId:a.loopId,text:'wrong key'},{keyId:a.key.id,sign:async(bytes)=>sign(null,bytes,b.privateKey)})).rejects.toThrow('forbidden');
    await t.db.query('update emba_role set revoked_at=now() where person_id=$1',[a.principal.personId]);
    await expect(publishAnnouncement(t.db,a.principal,{orgId:a.orgId,loopId:a.loopId,text:'revoked'},a.signer)).rejects.toThrow('forbidden');
  });
  it.skipIf(process.env.QB_DB!=='remote')('holds verification key status until the read transaction commits',async()=>{
    const a=await fixture();
    const notice=await publishAnnouncement(t.db,a.principal,{orgId:a.orgId,loopId:a.loopId,text:'Verified notice'},a.signer);
    let checked=false;
    const observed:Db={query:t.db.query.bind(t.db),tx:fn=>t.db.tx(q=>fn({query:async<T>(sql:string,params?:unknown[])=>{
      const result=await q.query<T>(sql,params);
      if(sql.includes('from emba_announcement_key where id=$1')) {
        checked=true;
        await expect(t.db.tx(async other=>{
          await other.query("set local lock_timeout='100ms'");
          await other.query("update emba_announcement_key set status='revoked' where id=$1",[a.key.id]);
        })).rejects.toMatchObject({code:'55P03'});
      }
      return result;
    }}))};
    expect((await readAnnouncement(observed,a.principal,notice.id)).verified).toBe(true);
    expect(checked).toBe(true);
    await retireAnnouncementKey(t.db,a.principal,a.key.id,'revoked');
    expect((await readAnnouncement(t.db,a.principal,notice.id)).verified).toBe(false);
  });
});
