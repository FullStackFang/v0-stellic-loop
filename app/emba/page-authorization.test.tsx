import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {withPortalTestSession} from '@/lib/emba/portal-session';
import {issueInvitation} from '@/lib/emba/invitations';

const late=vi.hoisted(()=>({change:null as null|(()=>Promise<void>)}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('./trip-panel',()=>({TripPanel:()=>null}));
// Async server panels have their own authorization integration tests.
vi.mock('./group-memory-panel',()=>({GroupMemoryPanel:()=>null}));
vi.mock('./data',async()=>{
  const actual=await vi.importActual<typeof import('./data')>('./data');
  return {...actual,readScopedMemory:async(...args:Parameters<typeof actual.readScopedMemory>)=>{
    const result=await actual.readScopedMemory(...args);
    if(args[1]&&late.change)await late.change();
    return result;
  }};
});
import MemberPortal from './page';

let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});
beforeEach(async()=>{late.change=null;await t.reset();});
afterAll(async()=>{await t.close();});

it.each(['demotion','membership removal','identity revocation'])('does not render earlier organizer data after late %s',async change=>{
  const f=await seedEmbaFixture(t.db);
  const email='private-invitation-canary@example.test';
  await issueInvitation(t.db,f.organizer,{...f.vietnam,recipientEmail:email,role:'member',expiresAt:'2098-01-01T00:00:00Z'});
  late.change=async()=>{
    if(change==='demotion')await t.db.query("update emba_role set role='member' where person_id=$1",[f.organizer.personId]);
    else if(change==='membership removal')await t.db.query('update emba_membership set revoked_at=now() where person_id=$1',[f.organizer.personId]);
    else await t.db.query('update emba_identity set revoked_at=now() where person_id=$1',[f.organizer.personId]);
  };
  const page=await withPortalTestSession(f.organizer,()=>MemberPortal({searchParams:Promise.resolve(f.vietnam)}));
  render(page);
  expect(screen.queryByText(email,{exact:false})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Create invitation'})).not.toBeInTheDocument();
  if(change!=='demotion')expect(screen.getByRole('heading',{name:'Member space unavailable'})).toBeInTheDocument();
});

it('omits another organization revoked while the selected scope remains available',async()=>{
  const f=await seedEmbaFixture(t.db);
  const {rows:[org]}=await t.db.query<{id:string}>("insert into emba_organization(name) values('OTHER_ORGANIZATION_CANARY') returning id");
  const {rows:[loop]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'private-other-trip') returning id",[org.id]);
  await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)',[org.id,f.organizer.personId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'member')",[org.id,loop.id,f.organizer.personId]);
  late.change=async()=>{await t.db.query('update emba_membership set revoked_at=now() where org_id=$1',[org.id]);};
  render(await withPortalTestSession(f.organizer,()=>MemberPortal({searchParams:Promise.resolve(f.vietnam)})));
  expect(screen.queryAllByText(/OTHER_ORGANIZATION_CANARY/)).toHaveLength(0);
  expect(screen.getByRole('heading',{name:'Your plans start with you.'})).toBeInTheDocument();
});
