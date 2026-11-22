// @vitest-environment node
import { writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate } from '@/lib/emba/access';
import { createPoll } from '@/lib/when/polls';
import Image from './[id]/opengraph-image';

let t: TestDb;
vi.mock('@/lib/db', async original => ({ ...await original<typeof import('@/lib/db')>(), db: () => t.db }));
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });

it('draws the picture a chat app shows under a poll\'s link, and lets it be kept only for minutes', async () => {
  const row = await makePerson(t.db, 'Maya');
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  const maya = (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: 'maya@cornell.edu' })))!;
  const { id } = await createPoll(t.db, maya, { title: 'Pitch Practice W/ EIR (Team 1 | Aaron)', startDate: '2026-11-30', endDate: '2026-12-04', hourStart: 17, hourEnd: 22, timezone: 'America/New_York', expectedSize: 7, deadline: new Date(Date.now() + 5 * 86_400_000).toISOString(), threshold: 'two_thirds' });
  for (const [name, poll] of [['poll', id], ['none', 'AAAAAAAAAAAA']]) {
    const image = await Image({ params: Promise.resolve({ id: poll }) }), bytes = Buffer.from(await image.arrayBuffer());
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('cache-control')).toBe('public, max-age=300');
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    // Chat apps drop a picture that is too heavy.
    expect(bytes.length).toBeLessThan(300_000);
    if (process.env.OG_OUT) await writeFile(`${process.env.OG_OUT}/og-${name}.png`, bytes);
  }
});
