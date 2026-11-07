import { generateKeyPairSync, sign } from 'node:crypto';
import type { Db } from '../lib/db';
import { authenticate } from '../lib/emba/access';
import { createActivity, finalizeActivity, saveCommitment } from '../lib/emba/activities';
import { publishAnnouncement, registerAnnouncementKey } from '../lib/emba/announcements';
import { uploadDocument, processDocument } from '../lib/emba/knowledge';
import { saveMemory } from '../lib/emba/memory';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const issuer = 'urn:loop:synthetic-emba-rehearsal';
export const afternoon = { place: 'Hanoi', start: '2099-02-02T06:00:00Z', end: '2099-02-02T10:00:00Z', query: 'Hanoi bus' };

export async function seedEmbaFixture(db: Db) {
  const orgId = uuid(1), rootId = uuid(2), vietnamId = uuid(3), estoniaId = uuid(4);
  await db.query('insert into emba_organization(id,name) values($1,$2)', [orgId, 'Synthetic EMBA']);
  await db.query('insert into emba_loop(id,org_id,path) values($1,$2,$3)', [rootId, orgId, 'emba']);
  await db.query('insert into emba_loop(id,org_id,parent_id,path) values($1,$2,$3,$4)', [vietnamId, orgId, rootId, 'emba/vietnam']);
  await db.query('insert into emba_loop(id,org_id,parent_id,path) values($1,$2,$3,$4)', [estoniaId, orgId, rootId, 'emba/estonia']);
  const people = [];
  for (let n = 1; n <= 10; n++) {
    const id = uuid(100 + n), name = n === 1 ? 'Member A' : n === 2 ? 'Member B' : n === 9 ? 'Organizer' : n === 10 ? 'Nonmember' : `Member ${n}`;
    await db.query('insert into person(id,phone,name) values($1,$2,$3)', [id, `+1607555${String(2000 + n)}`, name]);
    await db.query('insert into emba_identity(issuer,subject,person_id,verified_at) values($1,$2,$3,now())', [issuer, `person-${n}`, id]);
    if (n !== 10) {
      await db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [orgId, id]);
      await db.query('insert into emba_role(org_id,loop_id,person_id,role) values($1,$2,$3,$4)', [orgId, rootId, id, n === 9 ? 'organizer' : 'member']);
    }
    const claims = { issuer, subject: `person-${n}`, expiresAt: Date.parse('2099-01-01T00:00:00Z') };
    const principal = await authenticate(db, 'synthetic', async () => claims);
    if (!principal) throw new Error('Fixture identity failed');
    people.push(principal);
  }
  const members = people.slice(0, 8), memberA = people[0], memberB = people[1], organizer = people[8], nonmember = people[9];
  const vietnam = { orgId, loopId: vietnamId }, estonia = { orgId, loopId: estoniaId };
  const pair = generateKeyPairSync('ed25519');
  const key = await registerAnnouncementKey(db, organizer, { ...vietnam, publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() });
  const announcement = await publishAnnouncement(db, organizer, { ...vietnam, text: 'Vietnam trip update: meet at the Hanoi hotel lobby before the afternoon bus.' }, { keyId: key.id, sign: async bytes => sign(null, bytes, pair.privateKey) });
  const document = await uploadDocument(db, organizer, { ...vietnam, operationId: uuid(201), title: 'Hanoi itinerary v1', mediaType: 'application/json', body: JSON.stringify({ itineraryVersion: 'v1', timezone: 'Asia/Ho_Chi_Minh', passages: [{ text: 'The Hanoi bus leaves the hotel at 14:00 local time on 2 February 2099.', claimKey: 'hanoi-bus-departure', claimValue: '14:00' }] }) });
  await processDocument(db, organizer, document.id, document.version);
  await saveMemory(db, memberA, { operationId: uuid(202), kind: 'want', text: 'I want a quiet Hanoi afternoon with time for a short food walk.', category: 'food', place: 'Hanoi', strength: 0.9, confidence: 1 });
  await saveMemory(db, memberA, { operationId: uuid(203), kind: 'intent', text: 'Explore a calm Hanoi afternoon before the bus.', category: 'rest', place: 'Hanoi', strength: 0.8, confidence: 1, startsAt: afternoon.start, endsAt: afternoon.end });
  const activity = await createActivity(db, organizer, { ...vietnam, title: 'Hanoi afternoon walk', place: 'Hanoi', timezone: 'Asia/Ho_Chi_Minh', startsAt: '2099-02-02T06:00:00Z', endsAt: '2099-02-02T07:00:00Z', deadline: '2099-02-01T06:00:00Z' });
  for (let i = 0; i < members.length; i++) await saveCommitment(db, members[i], { activityId: activity.id, revision: 1, operationId: uuid(300 + i), minOthers: i >= 6 ? 8 : 0, requires: [] });
  return { orgId, rootId, vietnam, estonia, members, memberA, memberB, organizer, nonmember, announcement, document, activity, key, publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}

export async function finalizeEmbaFixture(db: Db, fixture: Awaited<ReturnType<typeof seedEmbaFixture>>) {
  // The fixture dates remain in 2099; only the disposable DB deadline moves for finalization.
  await db.query("update emba_activity_revision set deadline='2000-01-01T00:00:00Z' where activity_id=$1 and revision=1", [fixture.activity.id]);
  await finalizeActivity(db, fixture.organizer, fixture.activity.id, 1);
}
