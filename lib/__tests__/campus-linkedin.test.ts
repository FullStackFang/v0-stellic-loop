// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import type { Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { picks, schoolsOfPerson } from '@/lib/campus/animal-tiers';
import { addedSchools, approveLinkedin, linkedinPeople, profileOf, removeLinkedin, setSchools } from '@/lib/campus/linkedin';
import { listCampuses } from '@/lib/campus/listings';
import { campusOf, pickFace } from '@/lib/campus/people';
import { campusViewer, mayUse } from '@/lib/campus/session';

// Schools unlocked by adding the address of a LinkedIn profile: their animals, and their campuses.
let t: TestDb;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); });

async function someone(name: string, email: string) {
  const { id } = await makePerson(t.db, name);
  return { personId: id, verifiedEmail: email, as: { personId: id, issuer: 'https://issuer.test', subject: `user_${id}`, verifiedEmail: email } as Principal };
}
const campusId = async (slug: string) => (await listCampuses(t.db)).find(each => each.slug === slug)!.id;
const mascots = async (personId: string) => (await picks(t.db, await schoolsOfPerson(t.db, personId))).school.map(tile => tile.name);

describe('the address of a LinkedIn profile', () => {
  it.each([
    ['linkedin.com/in/ana-lopez', 'https://www.linkedin.com/in/ana-lopez'],
    ['  https://www.linkedin.com/in/Ana-Lopez/  ', 'https://www.linkedin.com/in/ana-lopez'],
    ['http://uk.linkedin.com/in/ana-lopez-123?utm_source=share#about', 'https://www.linkedin.com/in/ana-lopez-123'],
    ['www.linkedin.com/in/ana%C3%A9', 'https://www.linkedin.com/in/ana%c3%a9'],
  ])('%s is kept in one spelling', (typed, kept) => expect(profileOf(typed)).toBe(kept));
  it.each(['', 'ana lopez', 'linkedin.com/company/loop', 'linkedin.com/in/', 'linkedin.com/in/ab', 'https://evil.test/linkedin.com/in/ana-lopez', 'notlinkedin.com/in/ana-lopez', 'linkedin.com/in/ana lopez', 'linkedin.com/in/ana/details'])('"%s" is not one', typed => expect(profileOf(typed)).toBeNull());
});

describe('unlocking schools with a LinkedIn profile', () => {
  it('gives a person at a school the animals and the campuses of the others they tick, and keeps their own', async () => {
    const ana = await someone('Ana', 'ana@cornell.edu');
    await campusOf(t.db, ana);
    expect(await mascots(ana.personId)).toEqual(['Cornell bear']);
    await expect(pickFace(t.db, ana.personId, 39)).rejects.toThrow('Pick one of the animals.');
    // Ticking their own school changes nothing: it is theirs already.
    await setSchools(t.db, ana, 'linkedin.com/in/ana-lopez', ['cornell', 'nyu']);
    expect(await addedSchools(t.db, ana.personId)).toEqual({ profile: 'https://www.linkedin.com/in/ana-lopez', added: ['nyu'], waiting: [] });
    expect(await mascots(ana.personId)).toEqual(['Cornell bear', 'NYU bobcat']);
    await pickFace(t.db, ana.personId, 39);
    await expect(pickFace(t.db, ana.personId, 38)).rejects.toThrow('Pick one of the animals.');
    const viewer = (await withPortalTestSession(ana.as, () => campusViewer()))!;
    expect(viewer.campus?.slug).toBe('cornell');
    expect(viewer.visits.sort()).toEqual([await campusId('cornell-tech'), await campusId('nyu')].sort());
    expect(mayUse(viewer, { id: await campusId('nyu') })).toBe(true);
    expect(mayUse(viewer, { id: await campusId('columbia') })).toBe(false);
    // Saving again replaces the schools: NYU is closed, Columbia opens.
    await setSchools(t.db, ana, 'linkedin.com/in/ana-lopez', ['columbia']);
    expect(await mascots(ana.personId)).toEqual(['Cornell bear', 'Columbia lion']);
    const next = (await withPortalTestSession(ana.as, () => campusViewer()))!;
    expect(mayUse(next, { id: await campusId('nyu') })).toBe(false);
    expect(mayUse(next, { id: await campusId('columbia') })).toBe(true);
  });

  it('keeps a person whose email is at no school waiting until the admin approves, then lets them in at the first school they ticked', async () => {
    const omar = await someone('Omar', 'omar@gmail.com');
    expect((await withPortalTestSession(omar.as, () => campusViewer()))!.campus).toBeNull();
    await expect(setSchools(t.db, omar, 'linkedin.com/in/omar-reyes', [])).rejects.toThrow('Pick at least one school.');
    expect((await t.db.query('select 1 from campus_linkedin')).rows).toHaveLength(0);
    // Sent, and nothing opens: no campus, no animals, and the schools are only waiting. Sending again changes what waits.
    await setSchools(t.db, omar, 'linkedin.com/in/omar-reyes', ['cuny']);
    await setSchools(t.db, omar, 'linkedin.com/in/omar-reyes', ['nyu', 'columbia']);
    expect(await addedSchools(t.db, omar.personId)).toEqual({ profile: 'https://www.linkedin.com/in/omar-reyes', added: [], waiting: ['nyu', 'columbia'] });
    expect((await withPortalTestSession(omar.as, () => campusViewer()))!.campus).toBeNull();
    expect(await mascots(omar.personId)).toEqual([]);
    await expect(pickFace(t.db, omar.personId, 39)).rejects.toThrow('Pick one of the animals.');
    await approveLinkedin(t.db, omar.personId);
    await approveLinkedin(t.db, omar.personId);   // a second press changes nothing
    const viewer = (await withPortalTestSession(omar.as, () => campusViewer()))!;
    expect(viewer.campus?.slug).toBe('nyu');
    expect(viewer.visits).toEqual([await campusId('columbia')]);
    expect(await mascots(omar.personId)).toEqual(['Columbia lion', 'NYU bobcat']);
    // They stay at the school that let them in, whatever they tick afterwards.
    await setSchools(t.db, omar, 'linkedin.com/in/omar-reyes', ['cuny']);
    expect((await withPortalTestSession(omar.as, () => campusViewer()))!.campus?.slug).toBe('nyu');
    expect(await addedSchools(t.db, omar.personId)).toMatchObject({ added: ['cuny'], waiting: [] });
  });

  it('refuses an address that is not a profile, a school Loop is not at, and a profile someone else added', async () => {
    const [ana, ben] = [await someone('Ana', 'ana@cornell.edu'), await someone('Ben', 'ben@gmail.com')];
    await campusOf(t.db, ana);
    await expect(setSchools(t.db, ana, 'facebook.com/ana', ['nyu'])).rejects.toThrow('Paste the address of your LinkedIn profile');
    await expect(setSchools(t.db, ana, 'linkedin.com/in/ana-lopez', ['hogwarts'])).rejects.toThrow('Pick from the schools Loop is at.');
    await setSchools(t.db, ana, 'linkedin.com/in/ana-lopez', ['nyu']);
    await expect(setSchools(t.db, ben, 'https://www.linkedin.com/in/ANA-LOPEZ/', ['cornell'])).rejects.toThrow('That LinkedIn profile is already on another account.');
    // Refused whole: nothing of Ben's waits for the admin.
    expect(await addedSchools(t.db, ben.personId)).toEqual({ profile: null, added: [], waiting: [] });
  });

  it('shows the admin who added one, the ones waiting first, and removing it closes what it unlocked', async () => {
    const [ana, omar, pia] = [await someone('Ana', 'ana@cornell.edu'), await someone('Omar', 'omar@gmail.com'), await someone('Pia', 'pia@gmail.com')];
    await campusOf(t.db, ana);
    await setSchools(t.db, ana, 'linkedin.com/in/ana-lopez', ['nyu']);
    // Omar signed in with LinkedIn, so the name on that account is kept for the admin; Pia only pasted an address.
    await setSchools(t.db, omar, 'linkedin.com/in/omar-reyes', ['columbia'], '  Omar Reyes ');
    await setSchools(t.db, pia, 'linkedin.com/in/pia-novak', ['cuny']);
    expect((await linkedinPeople(t.db)).map(each => [each.name, each.owner]).sort()).toEqual([['Ana', null], ['Omar', 'Omar Reyes'], ['Pia', null]]);
    expect((await linkedinPeople(t.db)).map(each => [each.name, each.waiting]).sort()).toEqual([['Ana', false], ['Omar', true], ['Pia', true]]);
    expect((await linkedinPeople(t.db))[2].name).toBe('Ana');
    // A person removed while waiting was never let in.
    await removeLinkedin(t.db, pia.personId);
    await approveLinkedin(t.db, pia.personId);
    expect((await withPortalTestSession(pia.as, () => campusViewer()))!.campus).toBeNull();
    await approveLinkedin(t.db, omar.personId);
    expect((await linkedinPeople(t.db)).map(each => [each.name, each.email, each.profile, each.schools, each.waiting]).sort()).toEqual([
      ['Ana', 'ana@cornell.edu', 'https://www.linkedin.com/in/ana-lopez', ['cornell', 'nyu'], false],
      ['Omar', 'omar@gmail.com', 'https://www.linkedin.com/in/omar-reyes', ['columbia'], false]]);
    await removeLinkedin(t.db, ana.personId); await removeLinkedin(t.db, omar.personId);
    expect(await linkedinPeople(t.db)).toEqual([]);
    // Ana keeps the school her email is at; Omar, whom the profile let in, has no campus again.
    expect(await mascots(ana.personId)).toEqual(['Cornell bear']);
    expect((await withPortalTestSession(ana.as, () => campusViewer()))!.campus?.slug).toBe('cornell');
    expect((await withPortalTestSession(omar.as, () => campusViewer()))!.campus).toBeNull();
  });
});
