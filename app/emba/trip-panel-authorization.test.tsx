import {Children,isValidElement} from 'react';
import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import {openTestDb,type TestDb} from '@/test/db';
import {seedEmbaFixture} from '@/test/emba-fixture';
import {deleteDocument,uploadDocument} from '@/lib/emba/knowledge';

const late=vi.hoisted(()=>({change:null as null|(()=>Promise<void>)}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('./announcement-panel',()=>({AnnouncementPanel:()=>null}));
vi.mock('@/lib/emba/activities',async()=>{
  const actual=await vi.importActual<typeof import('@/lib/emba/activities')>('@/lib/emba/activities');
  return {...actual,readActivity:async(...args:Parameters<typeof actual.readActivity>)=>{
    const result=await actual.readActivity(...args);
    if(late.change)await late.change();
    return result;
  }};
});
import {MemberUpdates,TripPanel} from './trip-panel';

let t:TestDb;
beforeAll(async()=>{t=await openTestDb();});
beforeEach(async()=>{late.change=null;await t.reset();});
afterAll(async()=>{await t.close();});

async function show(f:Awaited<ReturnType<typeof seedEmbaFixture>>) {
  const panel=await TripPanel({principal:f.organizer,...f.vietnam,query:'Hanoi',documentId:f.document.id,memory:[]});
  // The async inbox is a separately authorized child; exercise the parent output here.
  render(<>{Children.toArray(panel.props.children).filter(child=>!isValidElement(child)||child.type!==MemberUpdates)}</>);
}

it('keeps current resources and organizer controls when authority remains current',async()=>{
  const f=await seedEmbaFixture(t.db);
  await show(f);
  expect(screen.getByText('Upload a trip resource')).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Hanoi afternoon walk'})).toBeInTheDocument();
});

it('discards organizer controls after demotion while activity details load',async()=>{
  const f=await seedEmbaFixture(t.db);
  late.change=async()=>{await t.db.query("update emba_role set role='member' where person_id=$1",[f.organizer.personId]);};
  await show(f);
  expect(screen.queryByText('Upload a trip resource')).not.toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Trip resources'})).toBeInTheDocument();
});

it.each(['membership removal','identity revocation'])('returns unavailable instead of throwing after late %s',async change=>{
  const f=await seedEmbaFixture(t.db);
  late.change=async()=>{await t.db.query(change==='membership removal'?'update emba_membership set revoked_at=now() where person_id=$1':'update emba_identity set revoked_at=now() where person_id=$1',[f.organizer.personId]);};
  const panel=await TripPanel({principal:f.organizer,...f.vietnam,query:'Hanoi',documentId:f.document.id,memory:[]});
  render(panel);
  expect(screen.getByRole('heading',{name:'Trip context unavailable'})).toBeInTheDocument();
  expect(screen.queryAllByText('Hanoi itinerary v1',{exact:false})).toHaveLength(0);
});

it.each(['withdrawal','correction'])('discards source content after late %s',async change=>{
  const f=await seedEmbaFixture(t.db);
  late.change=async()=>{
    if(change==='withdrawal')await deleteDocument(t.db,f.organizer,f.document.id,1);
    else await uploadDocument(t.db,f.organizer,{...f.vietnam,documentId:f.document.id,expectedVersion:1,operationId:'00000000-0000-4000-8000-000000008001',title:'Corrected itinerary',mediaType:'text/plain',body:'The bus is cancelled.'});
  };
  await show(f);
  expect(screen.queryAllByText('Hanoi itinerary v1',{exact:false})).toHaveLength(0);
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

it('rechecks the selected document scope when it differs from the trip scope',async()=>{
  const f=await seedEmbaFixture(t.db);
  const {rows:[other]}=await t.db.query<{id:string}>("insert into emba_loop(org_id,path) values($1,'separate-trip') returning id",[f.orgId]);
  await t.db.query("insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,'organizer')",[f.orgId,other.id,f.organizer.personId]);
  const document=await uploadDocument(t.db,f.organizer,{orgId:f.orgId,loopId:other.id,operationId:'00000000-0000-4000-8000-000000008002',title:'OTHER_TRIP_CANARY',mediaType:'text/plain',body:'Private other trip source.'});
  late.change=async()=>{await t.db.query('update emba_role set revoked_at=now() where loop_id=$1',[other.id]);};
  render(await TripPanel({principal:f.organizer,...f.vietnam,query:'Hanoi',documentId:document.id,memory:[]}));
  expect(screen.getByRole('heading',{name:'Trip context unavailable'})).toBeInTheDocument();
  expect(screen.queryByText('OTHER_TRIP_CANARY',{exact:false})).not.toBeInTheDocument();
});
