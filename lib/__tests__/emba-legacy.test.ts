import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { makeBoard, openTestDb, type TestDb } from '@/test/db';
import { boardBySlug, allBoards } from '../load';
import { createWorkspace, saveWorkspace, workspace } from '../trip-workspace-store';
import { emptyTripDraft } from '../trip-draft';
import { GET, POST } from '@/app/api/trips/[id]/route';
import { GET as document } from '@/app/api/trips/[id]/documents/[documentId]/route';
import { GET as file } from '@/app/api/trip/[slug]/files/[id]/route';
import { POST as upload } from '@/app/api/trip/[slug]/files/route';
import { POST as parse } from '@/app/api/trips/[id]/parse/route';
import { POST as uploadDraft } from '@/app/api/trips/[id]/documents/route';
import { GET as ics } from '@/app/p/[id]/invite.ics/route';
import { GET as og } from '@/app/p/[id]/og/route';
import { generateMetadata } from '@/app/b/[slug]/page';
import { world } from '@/test/world';
import { newDevice, signedIn } from '@/test/jar';
import { respond } from '@/actions/respond';
import { share } from '@/actions/share';
import { setShareWithSteward } from '@/actions/settings';
import { joinTrip } from '@/actions/trip';
import { spyNotifier, enterCode } from '@/test/notify';
import { resetLimits } from '@/lib/ratelimit';
import { joinBoard } from '../identity';
import { boardData, detailsFor, proposalById, responsesFor } from '../load';
import { tripItems } from '../trip-store';
import { notifyDropped, notifyReached } from '../after';
import { setNotifier, LogNotifier } from '../notify';
import { issueMagicLink } from '../tokens';
import { GET as magic } from '@/app/m/[token]/route';
import { NextRequest } from 'next/server';
import { GET as cron } from '@/app/api/cron/daily/route';
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let t: TestDb;
let loop: string;
beforeAll(async () => { t = await openTestDb(); });
beforeEach(async () => {
  await t.reset();
  newDevice(); resetLimits(); setNotifier(null);
  const { rows: [org] } = await t.db.query<{ id: string }>("insert into emba_organization(name) values ('Private cohort') returning id");
  const { rows: [row] } = await t.db.query<{ id: string }>("insert into emba_loop(org_id,path) values ($1,'cohort') returning id", [org.id]);
  loop = row.id;
});
afterAll(async () => { await t.close(); });

it('hides explicitly classified boards without changing unrelated public boards', async () => {
  const pilot = await makeBoard(t.db), publicBoard = await makeBoard(t.db);
  await t.db.query('update board set pilot_loop_id=$2 where id=$1', [pilot.id, loop]);
  expect(await boardBySlug(t.db, pilot.slug)).toBeNull();
  expect((await allBoards(t.db)).map(b => b.id)).toEqual([publicBoard.id]);
  expect(await boardBySlug(t.db, publicBoard.slug)).not.toBeNull();
});

it.each([false, true])('denies draft, publish, save and document access with old edit token (published=%s)', async published => {
  const { id, token } = await createWorkspace(t.db);
  const request = () => new Request('https://loop.test', { headers: { Authorization: `Bearer ${token}` } });
  const params = Promise.resolve({ id });
  if (published) expect((await POST(request(), { params })).status).toBe(200);
  const { rows: [doc] } = await t.db.query<{ id: string }>("insert into trip_document(workspace_id,name,mime,file_data) values ($1,'private-name.txt','text/plain',decode('c2VjcmV0','base64')) returning id", [id]);
  await t.db.query('update trip_workspace set pilot_loop_id=$2 where id=$1', [id, loop]);
  expect(await workspace(t.db, id, token)).toBeNull();
  expect(await saveWorkspace(t.db, id, token, 'overwrite', emptyTripDraft(), {}, 1)).toBe(false);
  expect((await GET(request(), { params })).status).toBe(404);
  expect((await POST(request(), { params })).status).toBe(404);
  expect((await parse(request(), { params })).status).toBe(404);
  expect((await uploadDraft(request(), { params })).status).toBe(404);
  const response = await document(request(), { params: Promise.resolve({ id, documentId: doc.id }) });
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain('secret');
  if (published) expect(await allBoards(t.db)).toEqual([]);
});

it('rejects public previews, file bytes, actions and low-level primitives for all legacy callers', async () => {
  const w = await world(t.db), owner = await w.person('Private owner');
  const id = await w.proposal(owner.id, { status: 'on', on_day: '2099-02-15', on_at: new Date().toISOString() });
  const board = (await boardBySlug(t.db, w.board.slug))!;
  const p = (await proposalById(t.db, id))!;
  const magicUrl = await issueMagicLink(t.db, owner.id, `/p/${id}`, 'on_text');
  const callers = [owner.id];
  const { rows: [scope] } = await t.db.query<{org_id:string}>('select org_id from emba_loop where id=$1', [loop]);
  for (const role of ['member', 'member', 'follower', 'removed', 'nonmember']) {
    const person = await w.person(role); callers.push(person.id);
    if (role !== 'nonmember') {
      await t.db.query('insert into emba_membership(org_id,person_id,revoked_at) values ($1,$2,$3)', [scope.org_id, person.id, role === 'removed' ? new Date().toISOString() : null]);
      await t.db.query('insert into emba_role(org_id,loop_id,person_id,role) values ($1,$2,$3,$4)', [scope.org_id, loop, person.id, role === 'removed' ? 'member' : role]);
    }
  }
  await t.db.query('insert into trip(board_id,owner_id) values ($1,$2)', [board.id, owner.id]);
  const { rows: [doc] } = await t.db.query<{id:string}>("insert into trip_item(board_id,owner_id,kind,title,shared,filename,file_data) values ($1,$2,'document','Secret',true,'secret.txt',decode('c2VjcmV0','base64')) returning id", [board.id, owner.id]);
  await t.db.query('update board set pilot_loop_id=$2 where id=$1', [board.id, loop]);
  for (const person of [null, ...callers]) {
    if (person) signedIn(person); else newDevice();
    const req = new Request('https://loop.test');
    expect((await file(req, { params: Promise.resolve({ slug: board.slug, id: doc.id }) })).status).toBe(404);
    expect((await ics(req, { params: Promise.resolve({ id }) })).status).toBe(404);
    expect((await og(req, { params: Promise.resolve({ id }) })).status).toBe(404);
    expect(await generateMetadata({ params: Promise.resolve({ slug: board.slug }) })).not.toHaveProperty('title');
    expect(await respond({ proposalId: id, answer: 'in' })).toMatchObject({ status: 'error', error: 'not_found' });
    expect(await share({ proposalId: id })).toMatchObject({ status: 'error', error: 'not_found' });
    expect(await joinTrip(board.slug, {})).toMatchObject({ status: 'error', error: 'not_found' });
  }
  const magicResponse = await magic(new NextRequest(magicUrl), { params: Promise.resolve({ token: magicUrl.split('/').at(-1)! }) });
  expect(new URL(magicResponse.headers.get('location')!).pathname).toBe('/');
  expect(magicResponse.cookies.get('qb')).toBeUndefined();
  await expect(issueMagicLink(t.db, owner.id, `/p/${id}`, 'on_text')).rejects.toThrow('not_found');
  expect((await upload(new Request('https://loop.test'), { params: Promise.resolve({ slug: board.slug }) })).status).toBe(404);
  expect(await setShareWithSteward(board.id, true)).toMatchObject({ error: 'not_found' });
  await expect(boardData(t.db, board)).rejects.toThrow('not_found');
  await expect(detailsFor(t.db, id)).rejects.toThrow('not_found');
  await expect(responsesFor(t.db, id)).rejects.toThrow('not_found');
  await expect(tripItems(t.db, board.id, owner.id)).rejects.toThrow('not_found');
  await expect(joinBoard(t.db, board.id, owner.id, null, { source: 'direct', shareId: null })).rejects.toThrow('not_found');
  const log = vi.fn();
  await new LogNotifier(t.db, log).dropped({ boardId: board.id, proposalId: id, title: p.title, url: '/private', to: owner.id, who: owner.id, count: 1 });
  expect(log).not.toHaveBeenCalled();
  const calls = spyNotifier();
  await notifyDropped(p, 'other', 1); await notifyReached(id);
  expect(calls).toEqual([]);
});

it('rechecks classification before replaying an already issued OTP', async () => {
  const w = await world(t.db), owner = await w.person();
  const id = await w.proposal(owner.id);
  const calls = spyNotifier();
  const phone = '+16075550199';
  expect(await respond({ proposalId: id, answer: 'in', name: 'New caller', phone })).toMatchObject({ status: 'needs_code' });
  await t.db.query('update board set pilot_loop_id=$2 where id=$1', [w.board.id, loop]);
  expect(await enterCode(calls, phone)).toMatchObject({ status: 'error', error: 'not_found' });
  expect((await t.db.query('select * from response where proposal_id=$1', [id])).rows).toEqual([]);
});

it('inherits board classification into published workspaces and excludes pilot cron writes', async () => {
  const { id, token } = await createWorkspace(t.db);
  const request = () => new Request('https://loop.test', { headers: { Authorization: `Bearer ${token}` } });
  const params = Promise.resolve({ id });
  await POST(request(), { params });
  const { rows: [w] } = await t.db.query<{board_id:string}>('select board_id from trip_workspace where id=$1', [id]);
  await t.db.query('update board set pilot_loop_id=$2 where id=$1', [w.board_id, loop]);
  await t.db.query("insert into proposal(board_id,title,deadline) values ($1,'Private expired plan','2020-01-01')", [w.board_id]);
  expect((await GET(request(), { params })).status).toBe(404);
  expect(await saveWorkspace(t.db, id, token, 'overwrite', emptyTripDraft(), {}, 1)).toBe(false);
  const result = await cron(new Request('https://loop.test', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }));
  expect(await result.json()).toEqual({ idled: 0 });
  await expect(t.db.query('delete from emba_loop where id=$1', [loop])).rejects.toThrow();
});
