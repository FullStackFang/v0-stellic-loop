import { spyNotifier, enterCode } from '@/test/notify';
import { resetLimits } from '@/lib/ratelimit';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { openTestDb, makeBoard, makePerson, type TestDb } from '@/test/db';
import { signedIn, newDevice } from '@/test/jar';
import { startTrip, joinTrip, changeTrip } from '@/actions/trip';
import { tripItems } from '@/lib/trip-store';
import { parseTripItem } from '@/lib/trip';
import { GET } from '@/app/api/trip/[slug]/files/[id]/route';
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
beforeEach(async () => { await t.reset(); newDevice(); });
afterAll(async () => { await t.close(); });
const form = (data: Record<string, string | undefined>) => { const f = new FormData(); for (const [key, value] of Object.entries(data)) if (value !== undefined) f.set(key, value); return f; };
async function setup() {
  const board = await makeBoard(t.db), owner = await makePerson(t.db, 'Organizer'), guest = await makePerson(t.db, 'Guest');
  await t.db.query('insert into trip (board_id,owner_id) values ($1,$2)', [board.id, owner.id]);
  return { board, owner, guest };
}
it('rejects invalid dates, times, blank titles, and unsupported types', () => {
  for (const input of [{title:''}, {day:'2026-02-30'}, {time:'25:01'}, {kind:'unknown'}]) expect(() => parseTripItem(form({title:'Dinner', kind:'activity', ...input}))).toThrow();
  expect(parseTripItem(form({title:'Arrival', kind:'arrival'})).shared).toBe(false);
});
it('persists a private arrival and only exposes it to its owner', async () => {
  const { board, owner, guest } = await setup(); signedIn(owner.id);
  expect(await changeTrip(board.slug, 'item', form({title:'My flight', kind:'arrival', day:'2027-06-12'}))).toEqual({ok:true});
  expect(await tripItems(t.db, board.id, guest.id)).toHaveLength(0);
  expect(await tripItems(t.db, board.id, null)).toHaveLength(0);
  expect(await tripItems(t.db, board.id, owner.id)).toHaveLength(1);
});
it('allows independent activity RSVPs and prevents another member deleting the activity', async () => {
  const { board, owner, guest } = await setup(); signedIn(owner.id);
  await changeTrip(board.slug, 'item', form({title:'Dinner', kind:'activity'}));
  const [item] = await tripItems(t.db, board.id, null); signedIn(guest.id);
  expect(await changeTrip(board.slug, 'rsvp', form({id:item.id,join:'yes'}))).toEqual({ok:true});
  await changeTrip(board.slug, 'rsvp', form({id:item.id,join:'yes'}));
  expect((await tripItems(t.db, board.id, guest.id))[0]).toMatchObject({count:1,joined:true});
  expect(await changeTrip(board.slug, 'delete', form({id:item.id}))).toHaveProperty('error');
  await changeTrip(board.slug, 'rsvp', form({id:item.id,join:'no'}));
  expect((await tripItems(t.db, board.id, guest.id))[0].count).toBe(0);
});
it('restricts trip settings to the organizer and rejects reversed dates', async () => {
  const { board, owner, guest } = await setup(); signedIn(guest.id);
  expect(await changeTrip(board.slug, 'settings', form({destination:'London'}))).toHaveProperty('error');
  signedIn(owner.id);
  expect(await changeTrip(board.slug, 'settings', form({start:'2027-06-12',end:'2027-06-10'}))).toHaveProperty('error');
  expect(await changeTrip(board.slug, 'settings', form({destination:'London',start:'2027-06-10',end:'2027-07-10'}))).toEqual({ok:true});
});
it('protects private file downloads even when the document ID is known', async () => {
  const {board,owner,guest} = await setup();
  const {rows:[file]} = await t.db.query<{id:string}>("insert into trip_item(board_id,owner_id,kind,title,filename,file_data) values ($1,$2,'document','Ticket','ticket.txt',decode($3,'base64')) returning id",[board.id,owner.id,Buffer.from('Private booking').toString('base64')]);
  const request = new Request('https://board.test'), params = Promise.resolve({slug:board.slug,id:file.id});
  signedIn(guest.id); expect((await GET(request,{params})).status).toBe(404);
  newDevice(); expect((await GET(request,{params})).status).toBe(404);
  signedIn(owner.id); const response = await GET(request,{params}); expect(response.status).toBe(200); expect(await response.text()).toBe('Private booking');
});
it('requires a session before saving', async () => {
  const {board} = await setup(); expect(await changeTrip(board.slug,'item',form({title:'Dinner',kind:'activity'}))).toHaveProperty('error');
});


it('creates a trip after phone verification, then lets another person join after verification', async () => {
  resetLimits();
  const calls = spyNotifier();
  expect((await startTrip({board:'Cohort global trip',name:'Planner',phone:'+16075551234'})).status).toBe('needs_code');
  const created = await enterCode(calls,'+16075551234');
  expect(created.status).toBe('ok');
  if (created.status !== 'ok') throw new Error('Verification failed');
  expect(created.path).toMatch(/^\/trip\//);
  const slug = created.path!.split('/').pop()!;
  newDevice();
  expect((await joinTrip(slug,{name:'Traveler',phone:'+16075551235'})).status).toBe('needs_code');
  expect(await enterCode(calls,'+16075551235')).toMatchObject({status:'ok',path:created.path});
});
