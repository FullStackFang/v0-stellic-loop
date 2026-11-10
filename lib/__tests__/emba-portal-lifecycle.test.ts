import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { openTestDb, type TestDb } from '@/test/db';
import { seedEmbaFixture, finalizeEmbaFixture } from '@/test/emba-fixture';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { authenticate } from '@/lib/emba/access';
import { pollInbox } from '@/lib/emba/delivery';
import { readActivity } from '@/lib/emba/activities';
import { acknowledgeUpdate, revisePublishedActivity } from '@/app/emba/lifecycle-actions';
import { MemberUpdates } from '@/app/emba/trip-panel';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
let t: TestDb;
let f: Awaited<ReturnType<typeof seedEmbaFixture>>;
const idle = { status: 'idle' as const, message: '' };
beforeAll(async () => { t = await openTestDb(); });
beforeEach(async () => { await t.reset(); f = await seedEmbaFixture(t.db); });
afterAll(async () => { await t.close(); });
afterEach(cleanup);
function revisionForm() {
  const data = new FormData();
  for (const [key,value] of Object.entries({activityId:f.activity.id,revision:'1',...f.vietnam,title:'New walking plan',place:'Hanoi',timezone:'Asia/Ho_Chi_Minh',startsAt:'2099-02-03T06:00:00Z',endsAt:'2099-02-03T07:00:00Z',deadline:'2099-02-02T06:00:00Z',reviewed:'yes'})) data.set(key,value);
  return data;
}

it('publishes a reviewed fresh revision and rejects stale, unreviewed and unauthorized submissions', async () => {
  const data = revisionForm();
  expect((await revisePublishedActivity(idle,data)).status).toBe('error');
  expect((await withPortalTestSession(f.memberA,()=>revisePublishedActivity(idle,data))).status).toBe('error');
  data.delete('reviewed');
  expect((await withPortalTestSession(f.organizer,()=>revisePublishedActivity(idle,data))).status).toBe('error');
  data.set('reviewed','yes');
  expect((await withPortalTestSession(f.organizer,()=>revisePublishedActivity(idle,data))).status).toBe('success');
  expect(await readActivity(t.db,f.memberA,f.activity.id)).toMatchObject({revision:2,title:'New walking plan',ownCommitment:null});
  expect(await withPortalTestSession(f.organizer,()=>revisePublishedActivity(idle,data))).toMatchObject({status:'error',message:expect.stringContaining('changed')});
});

it('polling never acknowledges, and only the current owner can explicitly acknowledge an update', async () => {
  await finalizeEmbaFixture(t.db,f);
  const updates = await pollInbox(t.db,f.memberA,{limit:20});
  expect(updates.items).toHaveLength(1);
  expect(updates.items[0].acknowledged_at).toBeNull();
  const data=new FormData(); data.set('id',updates.items[0].id); data.set('acknowledged','yes');
  expect((await withPortalTestSession(f.memberB,()=>acknowledgeUpdate(idle,data))).status).toBe('error');
  const delegated=(await authenticate(t.db,'test',async()=>({issuer:f.memberA.issuer,subject:f.memberA.subject,expiresAt:f.memberA.expiresAt,clientId:'assistant'})))!;
  expect((await withPortalTestSession(delegated,()=>acknowledgeUpdate(idle,data))).status).toBe('error');
  data.delete('acknowledged');
  expect((await withPortalTestSession(f.memberA,()=>acknowledgeUpdate(idle,data))).status).toBe('error');
  data.set('acknowledged','yes');
  expect((await withPortalTestSession(f.memberA,()=>acknowledgeUpdate(idle,data))).status).toBe('success');
  expect((await pollInbox(t.db,f.memberA)).items[0].acknowledged_at).not.toBeNull();
});

it('rejects acknowledging an obsolete update after reopening', async () => {
  await finalizeEmbaFixture(t.db,f);
  const old=(await pollInbox(t.db,f.memberA)).items[0];
  await withPortalTestSession(f.organizer,()=>revisePublishedActivity(idle,revisionForm()));
  const data=new FormData(); data.set('id',old.id); data.set('acknowledged','yes');
  expect((await withPortalTestSession(f.memberA,()=>acknowledgeUpdate(idle,data))).status).toBe('error');
  expect((await pollInbox(t.db,f.memberA)).items).toEqual([expect.objectContaining({kind:'reopened',revision:2,acknowledged_at:null})]);
});

it('renders explicit acknowledgement and recovers an expired page while preserving trip context', async () => {
  await finalizeEmbaFixture(t.db,f);
  const context={...f.vietnam,query:'Hanoi bus',documentId:f.document.id};
  render(await MemberUpdates({principal:f.memberA,context}));
  expect(screen.getByRole('checkbox',{name:'I have read this update.'})).toBeRequired();
  expect(screen.getByRole('button',{name:'Acknowledge update'})).toBeInTheDocument();
  expect((await pollInbox(t.db,f.memberA)).items[0].acknowledged_at).toBeNull();
  cleanup();
  render(await MemberUpdates({principal:f.memberA,context,cursor:'00000000-0000-4000-8000-000000009999'}));
  const latest=screen.getByRole('link',{name:'Load latest updates'});
  const url=new URL(latest.getAttribute('href')!,'http://localhost');
  expect(url.searchParams.get('orgId')).toBe(f.orgId);
  expect(url.searchParams.get('loopId')).toBe(f.vietnam.loopId);
  expect(url.searchParams.get('query')).toBe('Hanoi bus');
  expect(url.searchParams.has('updatesCursor')).toBe(false);
});
