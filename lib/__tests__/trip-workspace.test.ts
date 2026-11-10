import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { openTestDb, type TestDb } from '@/test/db';
import { createWorkspace, saveWorkspace, workspace } from '../trip-workspace-store';
import { emptyTripDraft } from '../trip-draft';
import { POST as publish } from '@/app/api/trips/[id]/route';
import { GET as document } from '@/app/api/trips/[id]/documents/[documentId]/route';

let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
beforeEach(async () => { await t.reset(); });
afterAll(async () => { await t.close(); });

it('saves an anonymous draft, preserves its records, and publishes it at a share link', async () => {
  const { id, token } = await createWorkspace(t.db);
  const draft = emptyTripDraft(); draft.name = 'EMBA trip'; draft.start = '2027-02-27';
  draft.places = [{ id: crypto.randomUUID(), name: 'London', from: '2027-02-27', to: '2027-03-03', hotel: '' }];
  draft.optional = [{ id: crypto.randomUUID(), label: 'Dinner', date: '', cost: '', min: '', deadline: '' }];
  expect(await workspace(t.db, id, 'wrong')).toBeNull();
  expect(await saveWorkspace(t.db, id, token, 'Meet in London.', draft, { start: draft.start }, 1)).toBe(true);
  expect(await saveWorkspace(t.db, id, token, 'Stale text', draft, {}, 1)).toBe(false);
  const saved = await workspace(t.db, id, token);
  expect(saved).toMatchObject({ writer: 'Meet in London.', revision: 1, pins: { start: '2027-02-27' } });
  expect((await t.db.query('select * from trip_place where workspace_id=$1', [id])).rows).toHaveLength(1);
  expect((await t.db.query('select * from trip_optional where workspace_id=$1', [id])).rows).toHaveLength(1);
  const response = await publish(new Request('https://loop.test', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(200);
  expect((await response.json()).slug).toMatch(/^emba-trip/);
});

it('serves a document by link only after publication', async () => {
  const { id, token } = await createWorkspace(t.db);
  const { rows: [file] } = await t.db.query<{ id: string }>(`insert into trip_document (workspace_id,name,mime,file_data) values ($1,'syllabus.txt','text/plain',decode($2,'base64')) returning id`, [id, Buffer.from('Trip facts').toString('base64')]);
  const params = Promise.resolve({ id, documentId: file.id });
  expect((await document(new Request('https://loop.test'), { params })).status).toBe(404);
  await publish(new Request('https://loop.test', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }), { params: Promise.resolve({ id }) });
  const response = await document(new Request('https://loop.test'), { params });
  expect(await response.text()).toBe('Trip facts');
});
