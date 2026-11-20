import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { flushSync } from 'react-dom';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { CampusScreen } from '@/components/campus/screen';
import { animal, animalOf, CUSTOM, PHOTO } from '@/lib/campus/animals';
import { Bar } from '@/app/groups/bar';
import { catalogue, setBuiltTier, setPictureTier } from '@/lib/campus/animal-tiers';
import { hasInk, INK_PAGE } from '@/lib/campus/ink';
import { customFaceImage, deletePicture, makeCustomFace, MAKES, premiumAsks, subscribe } from '@/lib/campus/custom-face';
import { GET as customFaceRoute } from '@/app/animals/custom/[token]/route';
import { findCampus, type Campus } from '@/lib/campus/listings';
import { campusOf, pickFace } from '@/lib/campus/people';
import { addHandListing } from '@/lib/campus/manage';
import { checkIn, imIn, joinByToken, outingByToken } from '@/lib/campus/outings';
import { postPlan } from '@/lib/campus/plans';
import { saveReward } from '@/lib/campus/rewards';
import { campusScreen, type ScreenViewer, type ShareLink } from '@/lib/campus/screen';
import { approveLinkedin } from '@/lib/campus/linkedin';
import { askForSchool, schoolAsked, schoolsAsked } from '@/lib/campus/school-ask';
import { againFaceAction, askSchoolAction, setSchoolsAction, checkInAction, imInAction, joinAction, makeFaceAction, ownFaceAction, useRewardAction as markUsed } from './actions';
import CampusPage from './[campus]/page';
import InkPage from './ink/page';
import PostPlanPage from './[campus]/post/page';
import CampusAdminPage from './admin/page';
import { removeSchoolAskAction } from './admin/actions';
import OutingLinkPage from '../o/[token]/page';

// The two models behind a person's own animal: one reads the photo, one draws it. Both are stood in for here.
const models = vi.hoisted(() => ({ look: '', drawn: null as Uint8Array | null, asked: [] as { text: string; images: number }[] }));
vi.mock('ai', async original => ({ ...(await original<typeof import('ai')>()),
  generateText: vi.fn(async () => ({ text: models.look })),
  generateImage: vi.fn(async ({ prompt }: { prompt: { text: string; images: unknown[] } }) => { models.asked.push({ text: prompt.text, images: prompt.images.length }); return { image: { uint8Array: models.drawn! } }; }) }));

// Specs: openspec/changes/loop-campus-rewards/specs/campus-screen, outings ("Who sees whom"), member-levels, campus-search.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// The bar's counter loads by itself on the server (its own tests: on-you.test.tsx). Drawn here it never settles, and the page under it loses what was pressed.
vi.mock('./on-you', () => ({ OnYou: () => null }));
// Whether the person signed in with LinkedIn is the sign-in service's to say. Here a test says it.
const linkedinOf = vi.hoisted(() => ({ account: null as { name: string; photo: string | null } | null }));
vi.mock('@/lib/campus/linkedin-account', () => ({ linkedinAccount: async () => linkedinOf.account }));
// The posting panel refreshes the list with the router, which a test render does not mount.
vi.mock('next/navigation', async original => ({ ...(await original<typeof import('next/navigation')>()), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useParams: () => ({}), usePathname: () => '/groups' }));

let t: TestDb, cornell: Campus;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); await t.db.query('delete from campus_place'); cornell = (await findCampus(t.db, 'cornell'))!; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); linkedinOf.account = null; });

const soon = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();
async function person(name: string, email = `${name.split(' ')[0].toLowerCase()}@cornell.edu`): Promise<Principal> {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
async function group(name: string, ...people: Principal[]) {
  const { rows: [org] } = await t.db.query<{ id: string }>('insert into emba_organization(name) values($1) returning id', [name]);
  for (const each of people) await t.db.query('insert into emba_membership(org_id,person_id) values($1,$2)', [org.id, each.personId]);
}
const event = async (title: string, over: { host?: string; place?: string; about?: string; hours?: number } = {}) => (await addHandListing(t.db, { campusId: cornell.id, title, startsAt: soon(over.hours ?? 3), host: over.host, place: over.place, about: over.about })).id;
const noPhotos = async () => ({});
const show = async (viewer: ScreenViewer | null, over: { link?: ShareLink; photos?: Record<string, string> } = {}) => {
  const model = await campusScreen(t.db, cornell, viewer, { link: over.link, photos: over.photos ? async () => over.photos! : noPhotos });
  return { model, ...render(<CampusScreen screen={model} signInHref="/sign-in?redirect_url=%2Fc%2Fcornell" openId={over.link?.listingId} />) };
};
const as = (who: Principal, admin = false): ScreenViewer => ({ personId: who.personId, admin });

/** Ana knows Ben (Team 4) and not Zebediah. Both are going to Blitz night, in outings of their own. */
async function world() {
  const [ana, ben, zeb] = [await person('Ana Lopez'), await person('Ben Okafor'), await person('Zebediah Quill')];
  await group('Team 4', ana, ben);
  const blitz = await event('Blitz night', { host: 'Chess Club', place: 'Willard Straight Hall, Room 414', about: 'Five-minute games, all levels.' });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Chess Club', kind: 'group', hostName: 'Chess Club', headCount: 3, texts: ['Skip the door', 'A board held for you', 'A seat at the final'] });
  const bens = await imIn(t.db, ben.personId, blitz), zebs = await imIn(t.db, zeb.personId, blitz);
  return { ana, ben, zeb, blitz, bens, zebs };
}

describe('signed out', () => {
  it('shows the week as tickets with counts and no names, and "Sign in" in the bar', async () => {
    const { ana, ben } = await world();
    await postPlan(t.db, ben.personId, cornell, { title: 'Sunset run', starts: new Date(Date.now() + 26 * 3600000).toISOString().slice(0, 16) });
    const { container } = await show(null);
    expect(screen.getByRole('heading', { name: 'Blitz night' })).toBeInTheDocument();
    expect(screen.getByText('Skip the door')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Sign in' })[0]).toHaveAttribute('href', '/sign-in?redirect_url=%2Fc%2Fcornell');
    // Posting needs sign-in: for a signed-out visitor the "+" leads to sign-in and back.
    expect(screen.getByRole('link', { name: 'Post a plan' })).toHaveAttribute('href', '/sign-in?redirect_url=%2Fc%2Fcornell');
    // Nobody is named: not the people going, not who posted a plan.
    for (const name of ['Ben', 'Okafor', 'Zebediah', 'Ana', 'Posted by']) expect(container.innerHTML).not.toContain(name);
    expect(container.innerHTML).not.toContain(ana.personId);
    // "I'm in" sends a signed-out visitor to sign in and back.
    expect(screen.getAllByRole('link', { name: "I'm in" })[0]).toHaveAttribute('href', '/sign-in?redirect_url=%2Fc%2Fcornell');
    expect(await imInAction((await world()).blitz)).toMatchObject({ ok: false, signIn: true });
  });
});

describe('who sees whom', () => {
  it('shows the first name of someone the viewer knows, and never a stranger', async () => {
    const { ana, ben, zeb } = await world();
    const { container } = await show(as(ana));
    // Ben is in a seat, by first name, as the animal his id works out to. Zebediah is a count and a filled seat.
    expect(screen.getByRole('img', { name: 'Ben' })).toHaveAttribute('src', animal(animalOf(ben.personId)));
    for (const hidden of ['Zebediah', 'Quill', 'Okafor', zeb.personId]) expect(container.innerHTML).not.toContain(hidden);
    expect(screen.getByText(/Group of 3/)).toBeInTheDocument();
  });
  it('shows the animal a person picked, and their photo only when they picked that', async () => {
    const { ana, ben } = await world(), photos = { [ben.personId]: 'https://img.test/ben.png' };
    await pickFace(t.db, ben.personId, 7);
    await show(as(ana), { photos });
    expect(screen.getByRole('img', { name: 'Ben' })).toHaveAttribute('src', animal(7));
    cleanup();
    await pickFace(t.db, ben.personId, PHOTO);
    await show(as(ana), { photos });
    expect(screen.getByRole('img', { name: 'Ben' })).toHaveAttribute('src', 'https://img.test/ben.png');
    cleanup();
    // A person who picked their photo and has none is back to their animal.
    await show(as(ana));
    expect(screen.getByRole('img', { name: 'Ben' })).toHaveAttribute('src', animal(animalOf(ben.personId)));
    // 36 to 41 are the premium animals; the number after them has no picture.
    await expect(pickFace(t.db, ben.personId, 42)).rejects.toThrow('Pick one of the animals.');
  });
  it('shows on the groups pages the same account card as the campus screen', async () => {
    const { ana } = await world();
    const card = async (admin: boolean) => { cleanup(); render(<Bar groups={[]} face={null} account={<button>Sign out</button>} screen={await campusScreen(t.db, cornell, as(ana, admin), { photos: noPhotos })} />); fireEvent.click(screen.getByRole('button', { name: /Show your level/ })); return within(screen.getByRole('dialog', { name: 'Your level' })); };
    const shown = await card(false);
    // The level, the picture and its picker, Ink and the colours, as on the campus screen.
    expect(shown.getByText(/level 1 of 3/)).toBeInTheDocument();
    expect(shown.getByRole('link', { name: 'See it' })).toHaveAttribute('href', '/c/ink');
    expect(shown.getByRole('group', { name: 'Colours' })).toBeInTheDocument();
    // Under them the groups pages' own links, and the way out.
    expect(within(shown.getByRole('navigation', { name: 'Groups' })).getAllByRole('link').map(each => each.getAttribute('href'))).toEqual(['/groups/connections', '/groups/reach', '/groups/archive']);
    expect(shown.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    fireEvent.click(shown.getByRole('button', { name: 'Change your picture' }));
    expect(screen.getByRole('group', { name: 'Pick your picture' })).toBeInTheDocument();
    // The admin's own list already leads to "How we got here".
    const admin = await card(true);
    expect(admin.getAllByRole('link', { name: 'How we got here' })).toHaveLength(1);
    // With no screen to draw it from, the bar keeps a plain card.
    cleanup(); render(<Bar groups={[]} face={null} account={null} />);
    expect(screen.getByRole('button', { name: 'Your account and colours' })).toBeInTheDocument();
  });
  it("offers a school's own animal to people of that school alone", async () => {
    const { ana } = await world(), noor = await person('Noor Haddad', 'noor@stern.nyu.edu'), bea = await person('Bea Ortiz', 'bea@baruch.cuny.edu'), guest = await person('Gus Reed', 'gus@gmail.com');
    for (const [who, email] of [[ana, 'ana@cornell.edu'], [noor, 'noor@stern.nyu.edu'], [bea, 'bea@baruch.cuny.edu'], [guest, 'gus@gmail.com']] as const) await campusOf(t.db, { personId: who.personId, verifiedEmail: email });
    const offered = async (viewer: ScreenViewer) => { const { picks } = (await campusScreen(t.db, cornell, viewer, { photos: noPhotos }))!.viewer!; return [picks.school.map(tile => tile.name), picks.premium.map(tile => tile.name)]; };
    expect(await offered(as(ana))).toEqual([['Cornell bear'], ['Dachshund']]);
    expect(await offered(as(noor))).toEqual([['NYU bobcat'], ['Dachshund']]);
    // A school can have more than one: every CUNY college's animal is offered to all of CUNY.
    expect(await offered(as(bea))).toEqual([['Baruch bearcat', 'Brooklyn bulldog'], ['Dachshund']]);
    expect(await offered(as(guest))).toEqual([[], ['Dachshund']]);
    expect(await offered(as(guest, true))).toEqual([['Cornell bear', 'Columbia lion', 'NYU bobcat', 'Baruch bearcat', 'Brooklyn bulldog'], ['Dachshund']]);
    // It is free to its own school's people, with no Ink; another school's person cannot pick it at all.
    await pickFace(t.db, ana.personId, 37);
    await expect(pickFace(t.db, noor.personId, 37)).rejects.toThrow('Pick one of the animals.');
    await pickFace(t.db, noor.personId, 39);
    await pickFace(t.db, bea.personId, 41);
    await expect(pickFace(t.db, ana.personId, 40)).rejects.toThrow('Pick one of the animals.');
    await pickFace(t.db, guest.personId, 38, true);
    // In the picker it wears the school's ring, first of the animals, and is picked with one press.
    await show(as(ana));
    fireEvent.click(screen.getByRole('button', { name: /Show your level/ })); fireEvent.click(screen.getByRole('button', { name: 'Change your picture' }));
    expect(screen.getByRole('button', { name: 'Cornell bear' })).toHaveClass('school');
    expect(screen.queryByRole('button', { name: 'NYU bobcat' })).toBeNull();
    // Mascots narrows the picker to the school's own, and a second press shows every animal again. Shuffle and Done are a picture each.
    fireEvent.click(screen.getByRole('button', { name: 'Mascots' }));
    expect(within(screen.getByRole('group', { name: 'Pick your picture' })).getAllByRole('button').map(each => each.getAttribute('aria-label'))).toEqual(['Create your own', 'Cornell bear']);
    fireEvent.click(screen.getByRole('button', { name: 'Mascots' }));
    expect(screen.getByRole('button', { name: 'Dachshund' })).toBeInTheDocument();
    for (const name of ['Shuffle', 'Done']) expect(screen.getByRole('button', { name })).toHaveTextContent('');
    cleanup();
    // The admin moves it to premium, and back to its school: it stays Cornell's alone either way.
    await setBuiltTier(t.db, 37, 'premium');
    expect(await offered(as(ana))).toEqual([[], ['Dachshund', 'Cornell bear']]);
    expect(await offered(as(noor))).toEqual([['NYU bobcat'], ['Dachshund']]);
    await setBuiltTier(t.db, 37, 'school');
    expect(await offered(as(ana))).toEqual([['Cornell bear'], ['Dachshund']]);
    await expect(setBuiltTier(t.db, 3, 'school')).rejects.toThrow('No such animal');
  });
  it('opens "Save your picture" from the account card, in the rows\' place, and goes back to them', async () => {
    const { ana } = await world();
    // The pane asks the server for its grounds and its picture (app/c/save/route.test.ts): here nothing answers.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => [], text: async () => '' })));
    try {
      await show(as(ana));
      fireEvent.click(screen.getByRole('button', { name: /Ana Lopez, Member/ }));
      const card = within(screen.getByRole('dialog', { name: 'Your level' }));
      expect(card.getByText('Save your picture')).toBeInTheDocument();
      fireEvent.click(card.getByRole('button', { name: 'Save it' }));
      expect(card.getByRole('group', { name: 'Shape' })).toBeInTheDocument();
      expect(card.getByRole('img', { name: 'The picture as a profile' })).toHaveAttribute('src', '/c/save?shape=profile&ground=school&small=1');
      expect(card.getByRole('button', { name: /No mark/ })).toHaveTextContent('Ink+');
      // The rows stepped aside, as they do for the picker.
      expect(card.queryByText('Loopd Ink')).toBeNull();
      expect(card.queryByRole('button', { name: 'Save it' })).toBeNull();
      // The pencil on the picture still leads to the picker.
      fireEvent.click(card.getByRole('button', { name: 'Change your picture' }));
      expect(card.getByRole('group', { name: 'Pick your picture' })).toBeInTheDocument();
      fireEvent.click(card.getByRole('button', { name: 'Done' }));
      fireEvent.click(card.getByRole('button', { name: 'Save it' }));
      fireEvent.click(card.getByRole('button', { name: 'Done' }));
      expect(card.getByText('Loopd Ink')).toBeInTheDocument();
      expect(card.queryByRole('group', { name: 'Shape' })).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
  it('lets the viewer pick their picture in the account card: an animal, or their own photo', async () => {
    const { ana } = await world();
    await withPortalTestSession(ana, async () => {
      await show(as(ana), { photos: { [ana.personId]: 'https://img.test/ana.png' } });
      fireEvent.click(screen.getByRole('button', { name: /Ana Lopez, Member/ }));
      const card = within(screen.getByRole('dialog', { name: 'Your level' }));
      fireEvent.click(card.getByRole('button', { name: 'Change your picture' }));
      expect(card.getByRole('button', { name: `Animal ${animalOf(ana.personId) + 1}` })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(card.getByRole('button', { name: 'Animal 12' }));
      expect(card.getByRole('button', { name: 'Animal 12' })).toHaveAttribute('aria-pressed', 'true');
      await vi.waitFor(async () => expect((await t.db.query('select face from campus_face where person_id=$1', [ana.personId])).rows).toEqual([{ face: 11 }]));
      expect(card.getAllByRole('img', { name: 'Ana' })[0]).toHaveAttribute('src', animal(11));
      // A premium animal is for people who subscribed: for anyone else it opens the plan, and nothing is picked.
      fireEvent.click(card.getByRole('button', { name: 'Dachshund' }));
      expect(card.getByText('Loopd Ink')).toBeInTheDocument();
      fireEvent.click(card.getByRole('button', { name: 'Back' }));
      expect((await t.db.query('select face from campus_face where person_id=$1', [ana.personId])).rows).toEqual([{ face: 11 }]);
      fireEvent.click(card.getByRole('button', { name: 'Animal 12' }));
      await vi.waitFor(async () => expect((await t.db.query('select face from campus_face where person_id=$1', [ana.personId])).rows).toEqual([{ face: 11 }]));
      // Shuffle gives another animal, never the one you have, and keeps it.
      fireEvent.click(card.getByRole('button', { name: 'Shuffle' }));
      await vi.waitFor(async () => { const { rows: [row] } = await t.db.query<{ face: number }>('select face from campus_face where person_id=$1', [ana.personId]); expect(row.face).not.toBe(11); expect(row.face).toBeGreaterThanOrEqual(0); });
      fireEvent.click(card.getByRole('button', { name: 'Your photo' }));
      await vi.waitFor(async () => expect((await t.db.query('select face from campus_face where person_id=$1', [ana.personId])).rows).toEqual([{ face: PHOTO }]));
      expect(card.getAllByRole('img', { name: 'Ana' })[0]).toHaveAttribute('src', 'https://img.test/ana.png');
    });
  });
  it('draws a person their own animal from a photo: asked to subscribe, told it is free, and given it', async () => {
    const { ana, ben, blitz } = await world(), sharp = (await import('sharp')).default;
    // What the drawing model hands back: a small figure on a large transparent ground.
    models.look = '{"animal": true, "nearest": 23}'; models.asked = [];
    models.drawn = await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 100, height: 60, channels: 4, background: '#b5651d' } }).png().toBuffer(), left: 20, top: 30 }]).png().toBuffer();
    const photo = new File([await sharp({ create: { width: 64, height: 48, channels: 3, background: '#996644' } }).jpeg().toBuffer()], 'lili.jpg', { type: 'image/jpeg' });
    URL.createObjectURL = vi.fn(() => 'blob:lili'); URL.revokeObjectURL = vi.fn();
    let own = '';
    await withPortalTestSession(ana, async () => {
      const shown = await show(as(ana));
      fireEvent.click(screen.getByRole('button', { name: /Ana Lopez, Member/ }));
      const card = within(screen.getByRole('dialog', { name: 'Your level' }));
      fireEvent.click(card.getByRole('button', { name: 'Change your picture' }));
      expect(card.queryByRole('button', { name: 'Your own animal' })).toBeNull();
      // In a browser the card is redrawn between its own handling of a click and the page's, so the "+" is gone from
      // the card by the time the click reaches the page. The card must not take that for a click outside it.
      const redraw = () => flushSync(() => {});
      shown.container.addEventListener('click', redraw);
      card.getByRole('button', { name: 'Create your own' }).click();
      expect(screen.getByRole('dialog', { name: 'Your level' })).toBeInTheDocument();
      card.getByRole('button', { name: 'Back' }).click();
      expect(screen.getByRole('dialog', { name: 'Your level' })).toBeInTheDocument();
      shown.container.removeEventListener('click', redraw);
      fireEvent.click(card.getByRole('button', { name: 'Create your own' }));
      // It opens on the plan: Loopd Ink, its price, and more than this one thing.
      expect(card.getByText('Loopd Ink')).toBeInTheDocument();
      expect(card.getByText('a month')).toBeInTheDocument();
      expect(card.getByText('Join at any school')).toBeInTheDocument();
      expect(card.queryByLabelText('Photo of an animal')).toBeNull();
      // Subscribe asks for an email in its own place. Without one nothing is kept.
      fireEvent.click(card.getByRole('button', { name: 'Subscribe to Loopd Ink' }));
      fireEvent.click(card.getByRole('button', { name: 'Subscribe' }));
      expect(card.getByRole('alert')).toHaveTextContent('Enter the email to subscribe with.');
      expect((await t.db.query('select 1 from campus_custom_face')).rows).toEqual([]);
      fireEvent.change(card.getByLabelText('Email'), { target: { value: 'Ana@Cornell.edu' } });
      fireEvent.click(card.getByRole('button', { name: 'Subscribe' }));
      // Subscribed: told there is no payment yet, their face wears the mark, and only now is a photo asked for.
      expect(await card.findByText('Thanks for subscribing to Loopd Ink. Payment is not set up yet, so this one is free. Enjoy your avatar.')).toBeInTheDocument();
      expect((await t.db.query('select email,makes from campus_custom_face where person_id=$1', [ana.personId])).rows).toEqual([{ email: 'ana@cornell.edu', makes: 0 }]);
      // The pane is the Loopd Ink plate, and nothing in the card says Premium.
      expect(card.queryByText(/Premium/)).toBeNull();
      expect(card.getByText('Bring your own pet.')).toBeInTheDocument();
      fireEvent.click(card.getByRole('button', { name: 'Draw it' }));
      expect(card.getByRole('alert')).toHaveTextContent('Choose a photo of an animal first.');
      expect(models.asked).toHaveLength(0);
      fireEvent.change(card.getByLabelText('Photo of an animal'), { target: { files: [photo] } });
      fireEvent.click(card.getByRole('button', { name: 'Draw it' }));
      // Nothing is drawn on one press: it asks first, and takes a line of the person's own, with how long that may be.
      expect(card.getByText('Draw your pet?')).toBeInTheDocument();
      expect(card.getByText('0 of 60 letters, and you can leave it empty. Nothing is drawn until you press Yes.')).toBeInTheDocument();
      expect(models.asked).toHaveLength(0);
      fireEvent.click(card.getByRole('button', { name: 'Back' }));
      expect(card.getByText('Bring your own pet.')).toBeInTheDocument();
      fireEvent.click(card.getByRole('button', { name: 'Draw it' }));
      fireEvent.change(card.getByRole('textbox', { name: 'Anything to add' }), { target: { value: 'a red scarf' } });
      expect(card.getByRole('textbox', { name: 'Anything to add' })).toHaveAttribute('maxlength', '60');
      expect(card.getByText(/^11 of 60 letters/)).toBeInTheDocument();
      fireEvent.click(card.getByRole('button', { name: 'Yes, draw it' }));
      // While it is drawn, and after: thanks, no payment, a free picture.
      expect(await card.findByRole('status')).toHaveTextContent('Drawing your pet.');
      const made = await card.findByRole('img', { name: 'Your own animal' }, { timeout: 5000 });
      expect(card.getByText(/Thanks for subscribing/)).toBeInTheDocument();
      expect(card.getByText('Say hi to your new picture.')).toBeInTheDocument();
      // The ask and its email are kept, the picture is theirs, and it was drawn from one of the set and the photo.
      const { rows: [row] } = await t.db.query<{ email: string; makes: number; token: string }>('select email,makes,token from campus_custom_face where person_id=$1', [ana.personId]);
      expect(row).toMatchObject({ email: 'ana@cornell.edu', makes: 1 });
      own = `/animals/custom/${row.token}`;
      expect(made).toHaveAttribute('src', own);
      expect((await t.db.query('select face from campus_face where person_id=$1', [ana.personId])).rows).toEqual([{ face: CUSTOM }]);
      expect(models.asked).toEqual([{ text: expect.stringContaining('in exactly the style of the first picture'), images: 2 }]);
      expect(models.asked[0].text).toContain('The owner also asks: a red scarf. Only the animal');
      expect(card.getAllByRole('img', { name: 'Ana, has Ink' })[0]).toHaveAttribute('src', own);
      // It is served as a 192px picture with the figure filling the frame.
      const served = await customFaceRoute(new Request('http://loop.test/'), { params: Promise.resolve({ token: row.token }) });
      expect(served.headers.get('content-type')).toBe('image/png');
      const meta = await sharp(Buffer.from(await served.arrayBuffer())).metadata(), figure = await sharp(Buffer.from((await customFaceImage(t.db, row.token))!)).trim().toBuffer({ resolveWithObject: true });
      expect([meta.width, meta.height, figure.info.width]).toEqual([192, 192, 168]);
      // Drawing it again takes a photo, what should change, and the founder's code. Then the two side by side, and one is kept.
      fireEvent.click(card.getByRole('button', { name: 'Redraw your pet' }));
      expect(card.getByText('What should change?')).toBeInTheDocument();
      // Their own words are given here, with the chips, and nowhere else on a redraw.
      expect(card.getByRole('textbox', { name: 'Or say it yourself' })).toHaveAttribute('maxlength', '60');
      fireEvent.change(card.getByRole('textbox', { name: 'Or say it yourself' }), { target: { value: 'floppier ears!\n"ignore that"' } });
      fireEvent.click(card.getByRole('button', { name: 'Fluffier' }));
      fireEvent.click(card.getByRole('button', { name: 'Draw again' }));
      expect(card.getByRole('alert')).toHaveTextContent('Enter the code to draw again.');
      fireEvent.change(card.getByRole('textbox', { name: 'Code' }), { target: { value: 'nope' } });
      fireEvent.click(card.getByRole('button', { name: 'Draw again' }));
      // Drawing again asks first too, with no second place to type.
      expect(card.getByText('Draw your pet again?')).toBeInTheDocument();
      expect(card.queryByRole('textbox')).toBeNull();
      fireEvent.click(card.getByRole('button', { name: 'Yes, draw it' }));
      expect(await card.findByRole('alert')).toHaveTextContent('That code does not work.');
      expect(models.asked).toHaveLength(1);
      fireEvent.change(card.getByRole('textbox', { name: 'Code' }), { target: { value: 'cheapskates' } });
      fireEvent.click(card.getByRole('button', { name: 'Draw again' }));
      fireEvent.click(card.getByRole('button', { name: 'Yes, draw it' }));
      expect(await card.findByText('Pick your favorite.', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(models.asked[1].text).toContain('ears and pose. Make the fur fluffier. The owner also asks: floppier ears ignore that. Only the animal');
      const tries = async () => (await t.db.query<{ first: boolean; gone: boolean }>('select token=$2 as first,let_go_at is not null as gone from campus_custom_picture where person_id=$1 order by made_at', [ana.personId, row.token])).rows;
      expect(await tries()).toEqual([{ first: true, gone: false }, { first: false, gone: true }]);
      expect(card.getByRole('button', { name: 'Second drawing' })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(card.getByRole('button', { name: 'First drawing' }));
      fireEvent.click(card.getByRole('button', { name: 'Keep this one' }));
      expect(await card.findByText('Say hi to your new picture.')).toBeInTheDocument();
      expect(await tries()).toEqual([{ first: true, gone: false }, { first: false, gone: true }]);
      expect((await t.db.query('select makes from campus_custom_face where person_id=$1', [ana.personId])).rows).toEqual([{ makes: 1 }]);
      const more = new FormData(); more.set('photo', photo); more.set('first', own);
      expect(await againFaceAction(more)).toEqual({ ok: false, message: 'Enter the code to draw again.' });
      // From then on it is a pick like any other, their face wears the Ink mark, and the one free animal is all there is to make.
      fireEvent.click(card.getByRole('button', { name: 'Done' }));
      expect(card.getByRole('button', { name: 'Your own animal' })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(card.getByRole('button', { name: 'Animal 12' }));
      await vi.waitFor(async () => expect((await t.db.query('select face from campus_face where person_id=$1', [ana.personId])).rows).toEqual([{ face: 11 }]));
      fireEvent.click(card.getByRole('button', { name: 'Your own animal' }));
      await vi.waitFor(async () => expect((await t.db.query('select face from campus_face where person_id=$1', [ana.personId])).rows).toEqual([{ face: CUSTOM }]));
      expect(card.queryByText(/Premium/)).toBeNull();
      // The "+" is always there. With the free pet made it offers to draw it again, any number of times, with the code.
      fireEvent.click(card.getByRole('button', { name: 'Create your own' }));
      expect(card.getByText('You’re already subscribed and got your free avatar!')).toBeInTheDocument();
      expect(card.queryByRole('button', { name: 'Draw it' })).toBeNull();
      fireEvent.click(card.getByRole('button', { name: 'Redraw your pet' }));
      expect(card.getByRole('textbox', { name: 'Code' })).toBeInTheDocument();
      const again = new FormData(); again.set('photo', photo);
      await withPortalTestSession(ana, async () => expect(await makeFaceAction(again)).toEqual({ ok: false, message: 'You have made your free animal. Making more is not set up yet.' }));
      again.set('first', own); again.set('code', 'CHEAPSKATES');
      await withPortalTestSession(ana, async () => { expect(await againFaceAction(again)).toMatchObject({ ok: true }); expect(await againFaceAction(again)).toMatchObject({ ok: true }); });
      expect((await t.db.query('select count(*)::int as n from campus_custom_picture where person_id=$1 and let_go_at is null', [ana.personId])).rows).toEqual([{ n: 1 }]);
      fireEvent.click(card.getByRole('button', { name: 'Back' }));
      fireEvent.click(card.getByRole('button', { name: 'Back' }));
    });
    cleanup();
    // Ben knows Ana and is in her outing: he sees the animal she had made.
    await imIn(t.db, ana.personId, blitz);
    await show(as(ben));
    expect(screen.getAllByRole('img', { name: 'Ana, has Ink' })[0]).toHaveAttribute('src', own);
  });
  it('refuses a photo with no animal, a made animal nobody made, and more than a few', async () => {
    const { ana, ben } = await world(), sharp = (await import('sharp')).default;
    const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#996644' } }).jpeg().toBuffer();
    const send = (email?: string) => { const data = new FormData(); data.set('photo', new File([jpeg], 'p.jpg', { type: 'image/jpeg' })); if (email) data.set('email', email); return data; };
    models.drawn = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#b5651d' } }).png().toBuffer();
    await expect(pickFace(t.db, ben.personId, CUSTOM)).rejects.toThrow('Pick one of the animals.');
    expect((await customFaceRoute(new Request('http://loop.test/'), { params: Promise.resolve({ token: 'nope' }) })).status).toBe(404);
    expect(await makeFaceAction(send('ana@cornell.edu'))).toMatchObject({ ok: false, signIn: true });
    await withPortalTestSession(ana, async () => {
      expect(await makeFaceAction(send())).toEqual({ ok: false, message: 'Enter the email to subscribe with.' });
      // A person, an object: the ask is still kept, nothing is drawn, and their face stays.
      models.look = '{"animal": false, "nearest": 1}';
      expect(await makeFaceAction(send('ana@cornell.edu'))).toEqual({ ok: false, message: 'That does not look like an animal. Try a clear photo of one animal.' });
      expect((await t.db.query('select f.makes,(select count(*)::int from campus_custom_picture p where p.person_id=f.person_id) as pictures from campus_custom_face f where f.person_id=$1', [ana.personId])).rows).toEqual([{ makes: 0, pictures: 0 }]);
      expect((await t.db.query('select 1 from campus_face where person_id=$1', [ana.personId])).rows).toEqual([]);
      const bad = new FormData(); bad.set('photo', new File(['not a picture'], 'p.jpg'));
      expect(await makeFaceAction(bad)).toEqual({ ok: false, message: 'That file is not a photo Loopd can read. Try a JPEG or a PNG.' });
      models.look = '{"animal": true, "nearest": 23}';
      for (let made = 1; made <= MAKES; made++) expect(await makeFaceAction(send())).toMatchObject({ ok: true, left: MAKES - made });
      expect(await makeFaceAction(send())).toEqual({ ok: false, message: 'You have made your free animal. Making more is not set up yet.' });
      // Every picture made is kept, and a person may use any of their own. The admin's list has each ask with its pictures.
      const { rows: [first] } = await t.db.query<{ token: string }>('select token from campus_custom_picture where person_id=$1', [ana.personId]);
      const { rows: [second] } = await t.db.query<{ token: string }>('insert into campus_custom_picture(person_id,image) select person_id,image from campus_custom_picture where token=$1 returning token', [first.token]);
      expect(await ownFaceAction(`/animals/custom/${second.token}`)).toEqual({ ok: true });
      expect((await campusScreen(t.db, cornell, as(ana), { photos: noPhotos }))!.viewer).toMatchObject({ own: `/animals/custom/${second.token}`, owns: [first.token, second.token].map(token => `/animals/custom/${token}`), asked: true, makesLeft: 0 });
      expect(await premiumAsks(t.db)).toEqual([{ email: 'ana@cornell.edu', asked: expect.stringMatching(/^[0-9-]{10}$/), pictures: [first.token, second.token] }]);
      await withPortalTestSession(ben, async () => expect(await ownFaceAction(`/animals/custom/${first.token}`)).toEqual({ ok: false, message: 'Pick one of the animals.' }));
      // The admin offers one to everyone: it is in every picker, and Ben, who never subscribed, may use it.
      const seenBy = async (who: typeof ana) => (await campusScreen(t.db, cornell, as(who), { photos: noPhotos }))!.viewer!;
      const address = (token: string) => `/animals/custom/${token}`;
      const core = async (who: typeof ana) => (await seenBy(who)).picks.core.map(tile => tile.src), premium = async (who: typeof ana) => (await seenBy(who)).picks.premium.map(tile => tile.src);
      expect([(await core(ben)).length, await premium(ben)]).toEqual([36, ['/animals/37.png']]);
      await setPictureTier(t.db, first.token, 'core');
      expect((await catalogue(t.db)).made).toEqual([{ token: first.token, src: address(first.token), tier: 'core', email: 'ana@cornell.edu', name: null, words: ['made'] }, { token: second.token, src: address(second.token), tier: null, email: 'ana@cornell.edu', name: null, words: ['made'] }]);
      expect((await core(ben)).at(-1)).toBe(address(first.token));
      expect(await seenBy(ben)).toMatchObject({ own: null, owns: [], asked: false });
      await withPortalTestSession(ben, async () => {
        expect(await ownFaceAction(address(first.token))).toEqual({ ok: true });
        expect(await ownFaceAction(address(second.token))).toEqual({ ok: false, message: 'Pick one of the animals.' });
      });
      expect(await seenBy(ben)).toMatchObject({ face: CUSTOM, photo: address(first.token), own: address(first.token), asked: false });
      // No longer offered: it leaves the picker, and Ben keeps it. Deleted: it is gone for everyone, and Ben has his own animal again.
      await setPictureTier(t.db, first.token, 'own');
      expect(await core(ben)).toHaveLength(36);
      expect(await seenBy(ben)).toMatchObject({ own: address(first.token) });
      // Premium is for people who subscribed: a made animal, and one shipped with the app, both ways.
      await setPictureTier(t.db, second.token, 'premium');
      expect(await premium(ben)).toEqual(['/animals/37.png', address(second.token)]);
      await withPortalTestSession(ben, async () => expect(await ownFaceAction(address(second.token))).toEqual({ ok: false, message: 'That one comes with Loopd Ink.' }));
      await expect(pickFace(t.db, ben.personId, 36)).rejects.toThrow('That one comes with Loopd Ink.');
      await pickFace(t.db, ben.personId, 36, true);
      await setBuiltTier(t.db, 36, 'core'); await setBuiltTier(t.db, 4, 'premium'); await setBuiltTier(t.db, 5, 'off');
      expect([(await core(ben)).includes('/animals/37.png'), (await core(ben)).includes('/animals/05.png'), (await core(ben)).includes('/animals/06.png'), await premium(ben)]).toEqual([true, false, false, ['/animals/05.png', address(second.token)]]);
      await pickFace(t.db, ben.personId, 36);
      await expect(pickFace(t.db, ben.personId, 4)).rejects.toThrow('That one comes with Loopd Ink.');
      await expect(pickFace(t.db, ben.personId, 5)).rejects.toThrow('Pick one of the animals.');
      await subscribe(t.db, ben.personId, 'ben@cornell.edu');
      await pickFace(t.db, ben.personId, 4);
      await withPortalTestSession(ben, async () => expect(await ownFaceAction(address(first.token))).toEqual({ ok: false, message: 'Pick one of the animals.' }));
      await withPortalTestSession(ben, async () => expect(await ownFaceAction(address(second.token))).toEqual({ ok: true }));
      await setBuiltTier(t.db, 36, 'premium'); await setBuiltTier(t.db, 4, 'core'); await setBuiltTier(t.db, 5, 'core');
      await expect(setBuiltTier(t.db, 99, 'core')).rejects.toThrow('No such animal');
      await setPictureTier(t.db, second.token, 'own');
      await t.db.query('delete from campus_custom_face where person_id=$1', [ben.personId]);
      await withPortalTestSession(ben, async () => { await setPictureTier(t.db, first.token, 'core'); expect(await ownFaceAction(address(first.token))).toEqual({ ok: true }); await setPictureTier(t.db, first.token, 'own'); });
      await deletePicture(t.db, first.token);
      expect(await seenBy(ben)).toMatchObject({ face: animalOf(ben.personId), own: null });
      expect(await seenBy(ana)).toMatchObject({ owns: [address(second.token)], own: address(second.token) });
      expect(await customFaceImage(t.db, first.token)).toBeNull();
      await expect(deletePicture(t.db, first.token)).rejects.toThrow('No such picture');
      // The admin tests this, and is never stopped at the free one.
      expect(await makeCustomFace(t.db, ana.personId, jpeg, null, undefined, true)).toMatchObject({ left: MAKES });
      expect((await campusScreen(t.db, cornell, as(ana, true), { photos: noPhotos }))!.viewer).toMatchObject({ owns: { length: 2 }, makesLeft: MAKES });
    });
  });
  it('a stranger in the same outing is shown, by first name only', async () => {
    const { ana, zebs } = await world();
    await joinByToken(t.db, ana.personId, zebs.token);
    const { container } = await show(as(ana));
    expect(screen.getAllByRole('img', { name: 'Zebediah' }).length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toContain('Quill');
  });
  it('names who posted a plan to signed-in visitors', async () => {
    const { ana, zeb } = await world();
    await postPlan(t.db, zeb.personId, cornell, { title: 'Sunset run', starts: new Date(Date.now() + 26 * 3600000).toISOString().slice(0, 16) });
    await show(as(ana));
    expect(screen.getByText(/Posted by Zebediah/)).toBeInTheDocument();
  });
});

// Specs: openspec/changes/loop-ink-placements/specs/ink-placements, and "Top bar on one line" in its campus-screen.
describe('Loopd Ink', () => {
  const INK = '/c/ink';
  const card = (name: RegExp) => { fireEvent.click(screen.getByRole('button', { name })); return within(screen.getByRole('dialog', { name: 'Your level' })); };
  it('is had by a person who asked to subscribe, and its page has one address', async () => {
    const { ana, ben } = await world();
    await subscribe(t.db, ana.personId, 'ana@cornell.edu');
    expect([INK_PAGE, await hasInk(t.db, ana.personId), await hasInk(t.db, ben.personId)]).toEqual([INK, true, false]);
  });
  it('has a tab in the bar for everyone, signed in or not', async () => {
    const { ana } = await world();
    await show(null);
    expect(screen.getByRole('link', { name: 'Ink' })).toHaveAttribute('href', INK);
    cleanup();
    await show(as(ana));
    expect(screen.getByRole('link', { name: 'Ink' })).toHaveAttribute('href', INK);
  });
  it('has one row in the account card, which says so once the person has Ink', async () => {
    const { ana } = await world();
    await show(as(ana));
    let shown = card(/Ana Lopez, Member/);
    expect(shown.getByText('Loopd Ink')).toBeInTheDocument();
    expect(shown.queryByText('You have Ink')).toBeNull();
    expect(shown.getByRole('link', { name: 'See it' })).toHaveAttribute('href', INK);
    cleanup();
    await subscribe(t.db, ana.personId, 'ana@cornell.edu');
    await show(as(ana));
    shown = card(/Ana Lopez, Member/);
    expect(shown.getByText('You have Ink')).toBeInTheDocument();
    expect(shown.getByRole('link', { name: 'See it' })).toHaveAttribute('href', INK);
    expect(shown.queryByText(/Premium/)).toBeNull();
  });
  it('marks the animals that come with it in the picker, and is never called Premium', async () => {
    const { ana } = await world();
    await withPortalTestSession(ana, async () => {
      const { container } = await show(as(ana)), shown = card(/Ana Lopez, Member/);
      fireEvent.click(shown.getByRole('button', { name: 'Change your picture' }));
      // One grid: the Ink animals wear the mark, the others do not.
      expect(shown.getByRole('button', { name: 'Dachshund' }).querySelector('.cs-ink')).not.toBeNull();
      expect(shown.getByRole('button', { name: 'Animal 12' }).querySelector('.cs-ink')).toBeNull();
      // The picker has no link of its own to the Ink page: the filter wears the mark, and an Ink animal opens the plan.
      expect(shown.queryByRole('link', { name: 'With Ink' })).toBeNull();
      expect(shown.getByRole('button', { name: 'Ink' }).querySelector('.cs-ink')).not.toBeNull();
      expect(container.textContent).not.toMatch(/premium/i);
      // The filter is labelled "Ink" and narrows the grid to them.
      fireEvent.click(shown.getByRole('button', { name: 'Ink' }));
      expect(shown.getByRole('button', { name: 'Ink' })).toHaveAttribute('aria-pressed', 'true');
      expect(shown.queryByRole('button', { name: 'Animal 12' })).toBeNull();
      // Pressing one without Ink opens the ask pane, as before: the four perks, and plainly that they are not here yet.
      fireEvent.click(shown.getByRole('button', { name: 'Dachshund' }));
      expect(shown.getByText('Loopd Ink')).toBeInTheDocument();
      for (const perk of ['Your book, kept for good', 'Give an animal a month', 'Boost a group a month', 'Join at any school']) expect(shown.getByText(perk)).toBeInTheDocument();
      expect(shown.getByText(/These four are not here yet/)).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/premium/i);
      await expect(pickFace(t.db, ana.personId, 36)).rejects.toThrow('That one comes with Loopd Ink.');
    });
  });
  it('puts its mark on the face of a person who has it, and on nobody else', async () => {
    const { ana, ben } = await world(), others = [await person('Cy Park'), await person('Dee Ito'), await person('Eve Hart')];
    const trivia = await event('Trivia'), bens = await imIn(t.db, ben.personId, trivia);
    for (const each of [ana, ...others]) await joinByToken(t.db, each.personId, bens.token);
    await subscribe(t.db, ben.personId, 'ben@cornell.edu');
    // Ana is the admin and has not asked for Ink: being the admin does not give the mark.
    const { model, container } = await show(as(ana, true));
    const ticket = model.tickets.find(each => each.title === 'Trivia')!;
    // Four faces on the ticket, one with Ink.
    expect(ticket.stub.kind === 'none' && ticket.stub.faces.map(face => [face.first, face.ink])).toEqual([['Ben', true], ['Cy', false], ['Dee', false], ['Eve', false]]);
    expect(ticket.mine!.members.find(face => face.me)).toMatchObject({ ink: false });
    const marked = [...container.querySelectorAll('.cs-inked')];
    expect(marked.length).toBeGreaterThan(0);
    for (const each of marked) { expect(each.querySelector('img')).toHaveAccessibleName('Ben, has Ink'); expect(each.querySelector('.cs-blot')).not.toBeNull(); }
    expect(screen.queryByRole('img', { name: 'Ben' })).toBeNull();
    expect(screen.getAllByRole('img', { name: 'Cy' })[0].closest('.cs-inked')).toBeNull();
    expect(container.querySelector('.cs-acct .cs-inked')).toBeNull();
    cleanup();
    // Ben's own avatar in the bar wears it.
    const bar = await show(as(ben));
    expect(bar.container.querySelector('.cs-acct .cs-inked img')).toHaveAccessibleName('Ben, has Ink');
  });
});

describe('levels on the screen', () => {
  it('a Member sees the Member text of a reward and no text of a higher level', async () => {
    const { ana } = await world();
    const { container } = await show(as(ana));
    expect(screen.getByText('Skip the door')).toBeInTheDocument();
    for (const higher of ['A board held for you', 'A seat at the final']) expect(container.innerHTML).not.toContain(higher);
  });
  it('the badge on the avatar opens the level card, and only the admin gets "Admin"', async () => {
    const { ana } = await world();
    await show(as(ana));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ana Lopez, Member/ }));
    const card = screen.getByRole('dialog', { name: 'Your level' });
    expect(card).toHaveTextContent('Member · level 1 of 3');
    expect(card).toHaveTextContent('5 more to Regular');
    expect(within(card).queryByText('Admin')).toBeNull();
    expect(within(card).queryByRole('link', { name: 'The groups site' })).toBeNull();
    // The card also picks whose colours the screen wears. Loopd's and your schools' are free; another school's is an
    // Ink+ perk: in "Any school" it wears the Ink mark and opens the Ink+ card (public/demo/mockups-ink-colours.html).
    const colours = within(within(card).getByRole('group', { name: 'Colours' }));
    expect(colours.getAllByRole('button').map(button => button.textContent)).toEqual(['Loopd', 'Any school']);
    fireEvent.click(colours.getByRole('button', { name: 'Any school' }));
    fireEvent.click(colours.getByRole('button', { name: 'Columbia, with Ink+' }));
    expect(within(card).getByRole('dialog', { name: "Columbia's colours come with Ink+" })).toBeInTheDocument();
    expect(localStorage.getItem('loop-kit')).toBeNull();
    cleanup();
    // The admin may wear any, and the pick is kept on this browser.
    await show(as(ana, true));
    fireEvent.click(screen.getByRole('button', { name: /Ana Lopez, Member/ }));
    const theirs = within(within(screen.getByRole('dialog', { name: 'Your level' })).getByRole('group', { name: 'Colours' }));
    fireEvent.click(theirs.getByRole('button', { name: 'Any school' }));
    fireEvent.click(theirs.getByRole('button', { name: 'Columbia' }));
    expect(document.documentElement.dataset.kit).toBe('columbia');
    expect(localStorage.getItem('loop-kit')).toBe('columbia');
    await vi.waitFor(() => expect(theirs.getByRole('button', { name: 'Columbia' })).toHaveAttribute('aria-pressed', 'true'));
    delete document.documentElement.dataset.kit; localStorage.clear();
    const admin = within(screen.getByRole('navigation', { name: 'Admin' }));
    expect(admin.getByRole('link', { name: 'Run the campus' })).toHaveAttribute('href', '/c/admin');
    expect(admin.getByRole('link', { name: 'The groups site' })).toHaveAttribute('href', '/groups');
    expect(admin.getByRole('link', { name: 'How we got here' })).toHaveAttribute('href', '/groups/archive');
  });
});

describe('the row and its panel', () => {
  it('opens details beside the ticket, one at a time, with the map only when the place is matched', async () => {
    const { ana } = await world();
    await t.db.query("insert into campus_place(campus_id,name,lat,lon) values($1,'Olin Library',42.4479,-76.4843)", [cornell.id]);
    await event('Thesis sprint', { place: 'Olin Library, Room 701', hours: 5 });
    await show(as(ana));
    fireEvent.click(screen.getAllByRole('button', { name: 'Details' })[0]);
    expect(screen.getByText('Five-minute games, all levels.')).toBeInTheDocument();
    expect(screen.getByText(/Once 3 of you check in together/)).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();   // Willard Straight Hall is not a place Loopd knows
    fireEvent.click(screen.getAllByRole('button', { name: 'Details' })[0]);
    expect(screen.queryByText('Five-minute games, all levels.')).toBeNull();
    expect(document.querySelector('iframe')).toHaveAttribute('title', 'Map of Olin Library');
    expect(document.querySelectorAll('.cs-sheet')).toHaveLength(1);
  });
  it('"Register" on a feed event opens the panel, which does not claim the organizer was told', async () => {
    const { ana } = await world();
    const { rows: [feed] } = await t.db.query<{ id: string }>("insert into campus_feed(campus_id,source,url) values($1,'CampusGroups','https://feeds.test/x.ics') returning id", [cornell.id]);
    await t.db.query("insert into campus_listing(campus_id,origin,feed_id,feed_item_id,title,starts_at) values($1,'feed',$2,'x1','Resume drop-in',$3)", [cornell.id, feed.id, soon(4)]);
    await show(as(ana));
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByRole('button', { name: 'Register me' })).toBeInTheDocument();
    expect(screen.getByText(/CampusGroups is not told/)).toBeInTheDocument();
    await t.db.query('delete from campus_feed');
  });
  it('a share link opens that event with "Join", and joining puts the person in that outing', async () => {
    const { ana, blitz, zebs } = await world();
    const outing = (await outingByToken(t.db, zebs.token))!;
    await show(as(ana), { link: { token: zebs.token, outingId: outing.id, listingId: blitz } });
    expect(screen.getByText('You were sent a link to a group going to this.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Join' }).length).toBeGreaterThan(0);
    expect(await withPortalTestSession(ana, () => joinAction(zebs.token))).toEqual({ ok: true });
    cleanup();
    await show(as(ana));
    expect(screen.getByText("You're in")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
  });
});

describe('search on the screen', () => {
  const week = async () => {
    const { ana } = await world();
    for (const [title, host] of [['Sunset run, easy 5K', 'Running Club'], ['Dumpling night', 'Supper Club'], ['Resume drop-in', 'Career Services'], ['Sunrise hike', 'Outing Club'], ['Ballroom open floor', 'Dance Club'], ['Demo night', 'Builders']]) await event(title, { host, hours: 4 });
    return show(as(ana));
  };
  it('says what the row holds, and updates as the person types without leaving the screen', async () => {
    await week();
    expect(screen.getByRole('heading', { level: 2, name: 'Your best 5 of 7 this week' })).toBeInTheDocument();
    expect(screen.getByText('more this week')).toBeInTheDocument();
    const box = screen.getByRole('searchbox', { name: 'Say what you feel like doing' });
    fireEvent.change(box, { target: { value: 'exercise' } });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('for “exercise”');
    expect(screen.getByRole('heading', { name: 'Sunset run, easy 5K' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Resume drop-in' })).toBeNull();
    fireEvent.change(box, { target: { value: 'quidditch' } });
    expect(screen.getByRole('heading', { name: 'Nothing matches' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'eat with people' }));
    expect(screen.getByRole('heading', { name: 'Dumpling night' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'CampusGroups' }));
    expect(screen.getByRole('button', { name: 'CampusGroups' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('shows no reason and no score for the ranking', async () => {
    const { container, model } = await week();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'exercise' } });
    expect(container.innerHTML).not.toMatch(/score|rank|pull|because|recommended|matched on|picked for/i);
    // The numbers the order came from are in the model the server built and nowhere in the page.
    expect(model.tickets.some(ticket => ticket.pull > 0)).toBe(true);
    expect(container.querySelector('[data-pull],[data-score],[data-rank],[title*="match"]')).toBeNull();
  });
});

describe('rewards on the screen', () => {
  it('has no shelf with nothing being earned, and coupons with progress once there is', async () => {
    const { ana, ben } = await world();
    await saveReward(t.db, { campusId: cornell.id, giver: 'Collegetown Bagels', kind: 'building', texts: ['$5 off any order'], rule: 'outings', ruleCount: 3 });
    await show(as(ana));
    expect(screen.queryByText('Rewards you are earning')).toBeNull();
    cleanup();
    const study = await event('Study group', { hours: 0.2 }), mine = await imIn(t.db, ana.personId, study);
    await joinByToken(t.db, ben.personId, mine.token);
    await checkIn(t.db, ana.personId, study); await checkIn(t.db, ben.personId, study);
    await show(as(ana));
    expect(screen.getByRole('heading', { name: 'Rewards you are earning' })).toBeInTheDocument();
    expect(screen.getByText('$5 off any order')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 outings')).toBeInTheDocument();
  });
  it('an unlocked group reward shows at the counter in the top bar, and is marked used once', async () => {
    const { ana, ben } = await world();
    const coffee = await event('CS 2110 study group', { host: 'Northside Coffee', hours: 0.2 });
    await saveReward(t.db, { campusId: cornell.id, giver: 'Northside Coffee', kind: 'group', listingId: coffee, headCount: 2, texts: ['A drink and a pastry, $4.50 each'] });
    const mine = await imIn(t.db, ana.personId, coffee);
    await joinByToken(t.db, ben.personId, mine.token);
    expect(await withPortalTestSession(ana, () => markUsed(coffee))).toMatchObject({ ok: false });   // nobody has checked in
    expect(await withPortalTestSession(ana, () => checkInAction(coffee))).toEqual({ ok: true });
    await checkIn(t.db, ben.personId, coffee);
    await show(as(ana));
    expect(screen.getByText('Show at the counter')).toBeInTheDocument();
    expect(screen.getByText(/Unlocked for your group/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark as used' }).length).toBe(2);
    expect(await withPortalTestSession(ana, () => markUsed(coffee))).toEqual({ ok: true });
    expect(await withPortalTestSession(ben, () => markUsed(coffee))).toEqual({ ok: true });
    expect((await t.db.query('select 1 from campus_reward_use')).rows).toHaveLength(1);
    cleanup();
    await show(as(ana));
    expect(screen.queryByText('Show at the counter')).toBeNull();
    expect(screen.getAllByText(/^Used \d/).length).toBeGreaterThan(0);
  });
});

describe('the pages', () => {
  // A page hands back the async part that draws the week; a test has to run it, as the server would.
  const drawn = async (node: Promise<React.ReactElement>) => { const element = await node as React.ReactElement<object, (props: object) => Promise<React.ReactElement>>; return typeof element.type === 'function' ? element.type(element.props) : element; };
  const page = (slug: string) => drawn(CampusPage({ params: Promise.resolve({ campus: slug }) }));
  const linked = (token: string) => drawn(OutingLinkPage({ params: Promise.resolve({ token }) }));
  const sentTo = (path: string) => expect.objectContaining({ digest: expect.stringContaining(`;${path};`) });
  it('an unknown campus is not found', async () => {
    await expect(page('nowhere')).rejects.toMatchObject({ digest: expect.stringContaining('404') });
  });
  it('the Ink page has the same bar as the week, with the Ink tab lit, and the Ink page under it', async () => {
    const { ana } = await world();
    render(await InkPage());
    expect(screen.getByRole('link', { name: 'Ink' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'This week' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in?redirect_url=%2Fc%2Fink');
    expect(screen.getByTitle('Loopd Ink')).toHaveAttribute('src', '/demo/mockups-premium.html');
    cleanup();
    // Signed in, it is the person's own bar: their account, on their own campus.
    render(await withPortalTestSession(ana, () => InkPage()));
    expect(screen.getByRole('button', { name: /Ana Lopez, Member/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'This week' })).toHaveAttribute('href', '/c/cornell');
  });
  it('a signed-out visitor sees the campus screen', async () => {
    await world();
    render(await page('cornell'));
    expect(screen.getByRole('heading', { name: 'Blitz night' })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'This week' })).toHaveAttribute('aria-current', 'page');
    // The foot goes with the page (public/demo/mockups-footer.html): signed out it has the way home and the small print, not the groups pages.
    expect(within(screen.getByRole('contentinfo')).getAllByRole('link').map(link => link.textContent)).toEqual(['Loopd', 'Terms', 'Privacy']);
  });
  it("another school's address sends a person to their own, and each school has its own list", async () => {
    await world();
    const nyu = await person('Noor Haddad', 'noor@stern.nyu.edu');
    await expect(withPortalTestSession(nyu, () => page('cornell'))).rejects.toEqual(sentTo('/c/nyu'));
    render(await withPortalTestSession(nyu, () => page('nyu')));
    expect(screen.queryByRole('heading', { name: 'Blitz night' })).toBeNull();
    expect(await withPortalTestSession(nyu, async () => imInAction((await world()).blitz))).toMatchObject({ ok: false, message: expect.stringContaining("another school's list") });
  });
  it('a person at no school is shown no campus, only where Loopd is, and the admin opens any campus', async () => {
    const { blitz } = await world();
    const outsider = await person('Omar Reyes', 'omar@gmail.com');
    for (const slug of ['cornell', 'cornell-tech', 'columbia']) {
      render(await withPortalTestSession(outsider, () => page(slug)));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Loopd is only for schools right now. If that changes, we’ll let you know.');
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('omar@gmail.com is not a school email');
      expect(screen.queryByRole('heading', { name: 'Blitz night' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Post a plan' })).toBeNull();
      cleanup();
    }
    expect(await withPortalTestSession(outsider, () => imInAction(blitz))).toMatchObject({ ok: false });
    vi.stubEnv('LOOP_ADMIN', 'omar@gmail.com');
    render(await withPortalTestSession(outsider, () => page('columbia')));
    expect(screen.getByRole('button', { name: 'Post a plan' })).toBeInTheDocument();
  });
  it('a person at no school adds their LinkedIn profile, picks a school, waits, and is let in there once approved', async () => {
    const outsider = await person('Omar Reyes', 'omar@gmail.com');
    render(await withPortalTestSession(outsider, () => page('cornell')));
    const schools = within(screen.getByRole('group', { name: 'Your schools' }));
    expect(schools.getAllByRole('button').map(each => [each.textContent, each.getAttribute('aria-pressed')]).sort()).toEqual([['CUNY', 'false'], ['Columbia', 'false'], ['Cornell', 'false'], ['NYU', 'false']]);
    // An address that is not a profile's is refused, in words, and nobody is let in.
    fireEvent.change(screen.getByRole('textbox', { name: 'Your LinkedIn profile' }), { target: { value: 'omar reyes' } });
    fireEvent.click(schools.getByRole('button', { name: 'Columbia' }));
    expect(schools.getByRole('button', { name: 'Columbia' })).toHaveAttribute('aria-pressed', 'true');
    await withPortalTestSession(outsider, async () => { fireEvent.click(screen.getByRole('button', { name: 'Send for a check' })); await screen.findByRole('alert'); });
    expect(screen.getByRole('alert')).toHaveTextContent('Paste the address of your LinkedIn profile, like linkedin.com/in/your-name.');
    expect(await withPortalTestSession(outsider, () => setSchoolsAction('linkedin.com/in/omar-reyes', []))).toEqual({ ok: false, message: 'Pick at least one school.' });
    cleanup();
    // With a profile and a school they wait: the page says so and shows what they sent. It is final: nothing to change it with, and sending again is refused.
    expect(await withPortalTestSession(outsider, () => setSchoolsAction('linkedin.com/in/omar-reyes', ['columbia']))).toEqual({ ok: true });
    render(await withPortalTestSession(outsider, () => page('columbia')));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Loopd is only for schools right now.');
    expect(screen.getByText('Waiting').previousElementSibling).toHaveTextContent('Columbia');
    expect(screen.queryByRole('button', { name: 'Unlock' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change it' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send for a check' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(await withPortalTestSession(outsider, () => setSchoolsAction('linkedin.com/in/omar-reyes', ['nyu']))).toEqual({ ok: false, message: 'Your school is already with us for a check.' });
    // The page has the same top bar and foot as every other.
    expect(screen.getByRole('link', { name: 'This week' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms' })).toBeInTheDocument();
    cleanup();
    // The admin sees them waiting and approves. Then that school's campus is theirs, with its animal in their picker.
    vi.stubEnv('LOOP_ADMIN', 'ana@cornell.edu');
    const admin = await person('Ana Lopez');
    render(await withPortalTestSession(admin, () => CampusAdminPage({ searchParams: Promise.resolve({ tab: 'review' }) })));
    expect(screen.getByText('omar@gmail.com · wants Columbia · waiting since today')).toBeInTheDocument();
    expect(screen.getByText('Pasted an address only: the LinkedIn account is not proven theirs')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Review/ })).toHaveTextContent('1 waiting');
    expect(screen.getByRole('button', { name: 'Turn down' })).toBeInTheDocument();
    // Someone waiting is in the queue and not yet among the people let in.
    expect(screen.getByRole('link', { name: /LinkedIn/ })).toHaveTextContent('LinkedIn0');
    expect(screen.getByRole('link', { name: 'Open profile' })).toHaveAttribute('href', 'https://www.linkedin.com/in/omar-reyes');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    cleanup(); vi.unstubAllEnvs();
    await approveLinkedin(t.db, outsider.personId);
    render(await withPortalTestSession(outsider, () => page('columbia')));
    expect(screen.getByRole('button', { name: 'Post a plan' })).toBeInTheDocument();
    const theirs = (await campusScreen(t.db, (await findCampus(t.db, 'columbia'))!, as(outsider), { photos: noPhotos })).viewer!;
    expect(theirs.schools).toMatchObject({ profile: 'https://www.linkedin.com/in/omar-reyes', home: 'columbia', added: [] });
    expect(theirs.picks.school.map(tile => tile.name)).toEqual(['Columbia lion']);
  });
  it('a person adds their LinkedIn profile in the account card, and the schools they tick are theirs too', async () => {
    const { ana } = await world();
    await campusOf(t.db, { personId: ana.personId, verifiedEmail: 'ana@cornell.edu' });
    const open = async () => { cleanup(); await show(as(ana)); fireEvent.click(screen.getByRole('button', { name: /Show your level/ })); return within(screen.getByRole('dialog', { name: 'Your level' })); };
    let card = await open();
    expect(card.getByText('Your schools').nextElementSibling).toHaveTextContent('Cornell');
    fireEvent.click(card.getByRole('button', { name: 'Add a school' }));
    // Their own school is ticked and stays so.
    expect(card.getByRole('button', { name: 'Cornell' })).toBeDisabled();
    expect(card.getByRole('button', { name: 'Cornell' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(card.getByRole('textbox', { name: 'Your LinkedIn profile' }), { target: { value: 'https://www.linkedin.com/in/Ana-Lopez/' } });
    fireEvent.click(card.getByRole('button', { name: 'NYU' }));
    await withPortalTestSession(ana, async () => { fireEvent.click(card.getByRole('button', { name: 'Unlock' })); await card.findByRole('button', { name: 'Add a school' }); });
    // Coming back: both schools, NYU's animal beside Cornell's, and a way to NYU's campus.
    card = await open();
    expect(card.getByText('Your schools').nextElementSibling).toHaveTextContent('Cornell, NYU');
    fireEvent.click(card.getByRole('button', { name: 'Add a school' }));
    expect(card.getByRole('textbox', { name: 'Your LinkedIn profile' })).toHaveValue('linkedin.com/in/ana-lopez');
    expect(card.getByRole('button', { name: 'NYU' })).toHaveAttribute('aria-pressed', 'true');
    expect(card.getByRole('link', { name: 'Open NYU' })).toHaveAttribute('href', '/c/nyu');
    fireEvent.click(card.getByRole('button', { name: 'Back' })); fireEvent.click(card.getByRole('button', { name: 'Change your picture' }));
    expect(['Cornell bear', 'NYU bobcat'].map(name => card.getByRole('button', { name }).className)).toEqual(['cs-pet school', 'cs-pet school']);
    render(await withPortalTestSession(ana, () => page('nyu')));
    expect(screen.getAllByRole('button', { name: 'Post a plan' }).length).toBeGreaterThan(0);
  });
  it('a person who signed in with LinkedIn is shown the account is theirs, has one step left, and the admin sees the name', async () => {
    const outsider = await person('Omar Reyes', 'omar@gmail.com');
    // Without LinkedIn there is one ticket, and it says the email is not a school's.
    render(await withPortalTestSession(outsider, () => page('cornell')));
    expect(screen.getAllByRole('heading', { level: 2 }).map(each => each.textContent)).toEqual(['omar@gmail.com is not a school email']);
    cleanup();
    linkedinOf.account = { name: 'Omar Reyes', photo: 'https://img.test/omar.jpg' };
    render(await withPortalTestSession(outsider, () => page('cornell')));
    expect(screen.getAllByRole('heading', { level: 2 }).map(each => each.textContent)).toEqual(['Pick your school']);
    expect(screen.getByRole('button', { name: 'Send for a check' })).toBeInTheDocument();
    expect(screen.getByText('Signed in with LinkedIn').previousElementSibling).toHaveTextContent('Omar Reyes');
    expect(screen.getByText('Yours')).toBeInTheDocument();
    // Signed in with LinkedIn, they are not asked for the address of their profile as well: they tick a school and send.
    expect(screen.queryByRole('textbox', { name: 'Your LinkedIn profile' })).toBeNull();
    expect(screen.getByText('Pick the school you are at. We look you up on LinkedIn by your name to check it.')).toBeInTheDocument();
    cleanup();
    // On a database that still requires the address (the migration is run by hand), the box is still there.
    await t.db.query('alter table campus_linkedin alter column profile set not null');
    try {
      render(await withPortalTestSession(outsider, () => page('cornell')));
      expect(screen.getByRole('textbox', { name: 'Your LinkedIn profile' })).toBeInTheDocument();
      expect(await withPortalTestSession(outsider, () => setSchoolsAction('', ['nyu']))).toEqual({ ok: false, message: 'Paste the address of your LinkedIn profile, like linkedin.com/in/your-name.' });
      cleanup();
    } finally { await t.db.query('alter table campus_linkedin alter column profile drop not null'); }
    // Sending keeps the name on the LinkedIn account, and they still wait for the admin.
    render(await withPortalTestSession(outsider, () => page('cornell')));
    fireEvent.click(screen.getByRole('button', { name: 'NYU' }));
    await withPortalTestSession(outsider, async () => { fireEvent.click(screen.getByRole('button', { name: 'Send for a check' })); await vi.waitFor(async () => expect((await t.db.query('select profile,schools,owner_name from campus_linkedin where person_id=$1', [outsider.personId])).rows).toEqual([{ profile: null, schools: ['nyu'], owner_name: 'Omar Reyes' }])); });
    cleanup();
    render(await withPortalTestSession(outsider, () => page('cornell')));
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map(each => each.textContent)).toEqual(['We are checking']);
    cleanup(); linkedinOf.account = null;
    vi.stubEnv('LOOP_ADMIN', 'ana@cornell.edu');
    render(await withPortalTestSession(await person('Ana Lopez'), () => CampusAdminPage({ searchParams: Promise.resolve({ tab: 'review' }) })));
    expect(screen.getByText('Signed in with LinkedIn as Omar Reyes')).toBeInTheDocument();
    // No address was asked for, so the admin looks them up by name and school.
    expect(screen.getByRole('link', { name: 'Find on LinkedIn' })).toHaveAttribute('href', 'https://www.linkedin.com/search/results/people/?keywords=Omar%20Reyes%20NYU');
    cleanup();
    // Approved, they leave the queue and are listed with the people let in.
    await approveLinkedin(t.db, outsider.personId);
    render(await withPortalTestSession(await person('Ana Lopez'), () => CampusAdminPage({ searchParams: Promise.resolve({ tab: 'review' }) })));
    expect(screen.getByText('Nobody is waiting for you.')).toBeInTheDocument();
    cleanup();
    render(await withPortalTestSession(await person('Ana Lopez'), () => CampusAdminPage({ searchParams: Promise.resolve({ tab: 'linkedin' }) })));
    expect(screen.getByText('Signed in with LinkedIn as Omar Reyes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
  it('the admin sees the schools people signed up, the most asked first, and takes a typed-in one off', async () => {
    const asks: [string, string, string][] = [['Maya', 'maya@gmail.com', 'University of Michigan-Ann Arbor'], ['Dan', 'dan@umich.edu', 'university of michigan-ann arbor'], ['Sam', 'sam@rutgers.edu', 'Rutgers University-Newark'], ['Xo', 'x@mail.test', 'asdf']];
    for (const [name, email, school] of asks) await askForSchool(t.db, (await person(name, email)).personId, school, email);
    // A school on the list is kept under the list's name whatever the capitals, with its town; one typed in has no town.
    expect((await schoolsAsked(t.db)).map(each => [each.school, each.where, each.people, each.emails])).toEqual([['University of Michigan-Ann Arbor', 'Ann Arbor, MI', 2, ['dan@umich.edu', 'maya@gmail.com']], ['asdf', null, 1, ['x@mail.test']], ['Rutgers University-Newark', 'Newark, NJ', 1, ['sam@rutgers.edu']]]);
    vi.stubEnv('LOOP_ADMIN', 'ana@cornell.edu');
    const admin = await person('Ana Lopez');
    render(await withPortalTestSession(admin, () => CampusAdminPage({ searchParams: Promise.resolve({ tab: 'schools' }) })));
    expect(screen.getByRole('link', { name: /Schools/ })).toHaveTextContent('Schools3');
    expect(screen.getByText(/4 people, 3 schools\./)).toBeInTheDocument();
    expect(within(screen.getAllByRole('listitem')[0]).getByText('2 people')).toBeInTheDocument();
    expect(within(screen.getAllByRole('listitem')[0]).getByText(/^Ann Arbor, MI · last asked /)).toBeInTheDocument();
    expect(screen.getByText('dan@umich.edu · maya@gmail.com')).toBeInTheDocument();
    // Only the one typed in is marked, and only it can be taken off.
    expect(screen.getAllByText(/^Typed in, not on the list · last asked /)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Remove asdf' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Remove Rutgers University-Newark' })).toBeNull();
    cleanup();
    const form = new FormData(); form.set('campus', 'cornell'); form.set('tab', 'schools'); form.set('school', 'asdf');
    await expect(withPortalTestSession(admin, () => removeSchoolAskAction(form))).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT') });
    expect((await schoolsAsked(t.db)).map(each => each.school)).toEqual(['University of Michigan-Ann Arbor', 'Rutgers University-Newark']);
    // Nobody but the admin takes one off.
    form.set('school', 'rutgers university-newark');
    await withPortalTestSession(await person('Maya', 'maya@gmail.com'), () => removeSchoolAskAction(form)).catch(() => {});
    expect((await schoolsAsked(t.db)).map(each => each.school)).toEqual(['University of Michigan-Ann Arbor', 'Rutgers University-Newark']);
  });
  it('a person at no school picks their school from the list, and it is kept for when they come back', async () => {
    const outsider = await person('Omar Reyes', 'omar@gmail.com');
    render(await withPortalTestSession(outsider, () => page('cornell')));
    expect(screen.getByRole('status')).toHaveTextContent('We will email omar@gmail.com when Loopd opens there.');
    // Nothing is signed up until a school is picked; the action refuses an empty name by itself.
    expect(screen.getByRole('button', { name: 'Sign up my school' })).toBeDisabled();
    expect(await withPortalTestSession(outsider, () => askSchoolAction(' '))).toEqual({ ok: false, message: 'Type the name of your school.' });
    // A short name finds the school, as a pill to pick.
    const umich = await withPortalTestSession(outsider, async () => { fireEvent.change(screen.getByRole('textbox', { name: 'Your school' }), { target: { value: ' umich' } }); return screen.findByRole('button', { name: /^University of Michigan-Ann Arbor/ }); });
    expect(umich).toHaveTextContent('Ann Arbor, MI');
    expect(screen.queryByRole('button', { name: /^Other/ })).toBeNull();
    fireEvent.click(umich);
    expect(umich).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('We will email omar@gmail.com when Loopd opens at University of Michigan-Ann Arbor.');
    await withPortalTestSession(outsider, async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign up my school' })); await screen.findByText('On the list'); });
    expect(screen.getByText('University of Michigan-Ann Arbor')).toBeInTheDocument();
    expect((await t.db.query('select school,email from campus_school_ask where person_id=$1', [outsider.personId])).rows).toEqual([{ school: 'University of Michigan-Ann Arbor', email: 'omar@gmail.com' }]);
    cleanup();
    // Coming back, and changing it: a school Loopd is at cannot be signed up, and one the list has not is "Other".
    render(await withPortalTestSession(outsider, () => page('cornell')));
    expect(screen.getByText('University of Michigan-Ann Arbor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change school' }));
    expect(screen.getByRole('textbox', { name: 'Your school' })).toHaveValue('University of Michigan-Ann Arbor');
    const cornell = await withPortalTestSession(outsider, async () => { fireEvent.change(screen.getByRole('textbox', { name: 'Your school' }), { target: { value: 'cornell university' } }); return screen.findByRole('button', { name: /^Cornell University/ }); });
    expect(cornell).toHaveTextContent('Loopd is here');
    fireEvent.click(cornell);
    expect(screen.getByRole('status')).toHaveTextContent('Loopd is already at Cornell. Use the way in above.');
    expect(screen.getByRole('button', { name: 'Sign up my school' })).toBeDisabled();
    const other = await withPortalTestSession(outsider, async () => { fireEvent.change(screen.getByRole('textbox', { name: 'Your school' }), { target: { value: 'McGill  University' } }); return screen.findByRole('button', { name: 'Other: “McGill University”' }); });
    expect(screen.getByRole('status')).toHaveTextContent('No US college by that name on our list. Check the spelling, or add it as Other.');
    fireEvent.click(other);
    await withPortalTestSession(outsider, async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign up my school' })); await screen.findByText('On the list'); });
    expect((await t.db.query('select school from campus_school_ask')).rows).toEqual([{ school: 'McGill University' }]);
    // The action holds the same line by itself: no short name as "Other", and no school Loopd is already at.
    expect(await withPortalTestSession(outsider, () => askSchoolAction('Rutgers'))).toEqual({ ok: false, message: 'Pick your school from the ones found.' });
    expect(await withPortalTestSession(outsider, () => askSchoolAction('cornell university'))).toEqual({ ok: false, message: 'Loopd is already at Cornell.' });
    expect((await t.db.query('select school from campus_school_ask')).rows).toEqual([{ school: 'McGill University' }]);
    // Before the migration is run on a live database the page still opens, with the box.
    await t.db.query('alter table campus_school_ask rename to campus_school_ask_gone');
    try { expect(await schoolAsked(t.db, outsider.personId)).toBeNull(); } finally { await t.db.query('alter table campus_school_ask_gone rename to campus_school_ask'); }
  });
  it('an unknown share link is not found, and a real one opens its event', async () => {
    const { zebs } = await world();
    await expect(linked('nosuchtokennosuch')).rejects.toMatchObject({ digest: expect.stringContaining('404') });
    render(await linked(zebs.token));
    expect(screen.getAllByRole('link', { name: 'Join' })[0]).toHaveAttribute('href', `/sign-in?redirect_url=${encodeURIComponent(`/o/${zebs.token}`)}`);
  });
  it('the post page is only for changing a plan: it needs sign-in, and only the poster may', async () => {
    const { ana, ben } = await world(), post = (plan?: string) => PostPlanPage({ params: Promise.resolve({ campus: 'cornell' }), searchParams: Promise.resolve(plan ? { plan } : {}) });
    // Posting a new plan is the "+" on This week, so the bare address leads there.
    await expect(post()).rejects.toEqual(sentTo('/c/cornell'));
    await expect(withPortalTestSession(ana, () => post())).rejects.toEqual(sentTo('/c/cornell'));
    const plan = await postPlan(t.db, ana.personId, cornell, { title: 'Sunset run', starts: new Date(Date.now() + 26 * 3600000).toISOString().slice(0, 16) });
    render(await withPortalTestSession(ana, () => post(plan.id)));
    expect(screen.getByRole('textbox', { name: 'What is the plan?' })).toHaveValue('Sunset run');
    expect(screen.getByRole('button', { name: 'Cancel this plan' })).toBeInTheDocument();
    await expect(post(plan.id)).rejects.toEqual(sentTo(`/sign-in?redirect_url=${encodeURIComponent(`/c/cornell/post?plan=${plan.id}`)}`));
    await expect(withPortalTestSession(ben, () => post(plan.id))).rejects.toMatchObject({ digest: expect.stringContaining('404') });
  });
  it('the admin page is for the admin alone', async () => {
    const { ana } = await world(), admin = (tab?: string) => CampusAdminPage({ searchParams: Promise.resolve({ campus: 'cornell', tab }) });
    await expect(admin()).rejects.toEqual(sentTo('/sign-in?redirect_url=%2Fc%2Fadmin'));
    await expect(withPortalTestSession(ana, () => admin())).rejects.toMatchObject({ digest: expect.stringContaining('404') });
    vi.stubEnv('LOOP_ADMIN', 'ana@cornell.edu');
    render(await withPortalTestSession(ana, () => admin()));
    // One section at a time, events first; every form comes back to the section it is on.
    expect(screen.getByRole('heading', { level: 1, name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Blitz night is shown' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Good-for words of Blitz night' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Animals ?42$/ })).toHaveAttribute('href', '/c/admin?campus=cornell&tab=animals');
    for (const [tab, section] of Object.entries({ rewards: 'Rewards', feeds: 'Feeds', places: 'Places', tags: 'Tags', animals: 'Animals', premium: 'Premium', campus: 'Campus' })) {
      cleanup(); render(await withPortalTestSession(ana, () => admin(tab)));
      expect(screen.getByRole('heading', { level: 1, name: section })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: new RegExp(`^${section} ?[0-9]+$`) })).toHaveAttribute('aria-current', 'page');
      for (const field of document.querySelectorAll('input[name=tab]')) expect(field).toHaveValue(tab);
      if (tab === 'rewards') expect(screen.getByText(/Chess Club: Skip the door/)).toBeInTheDocument();
      // Animals are picked, any number of them, and moved together.
      if (tab === 'animals') { expect(screen.getAllByRole('checkbox')).toHaveLength(42); expect(screen.getByRole('checkbox', { name: 'Dachshund' })).toHaveAttribute('name', 'face'); expect(screen.getByRole('link', { name: 'School 5' })).toHaveAttribute('href', '/c/admin?campus=cornell&tab=animals&show=school'); expect(screen.getByRole('link', { name: 'Premium 1' })).toHaveAttribute('href', '/c/admin?campus=cornell&tab=animals&show=premium'); expect(screen.getByRole('button', { name: 'Core' })).toHaveAttribute('value', 'core'); }
    }
  });
});

// PREVIEW_DIR=… writes the screen's states as static pages, with the real stylesheet, for screenshots.
it.skipIf(!process.env.PREVIEW_DIR)('previews', async () => {
  const { writeFileSync, readFileSync } = await import('node:fs'), { renderToStaticMarkup } = await import('react-dom/server'), { pathToFileURL } = await import('node:url');
  const css = readFileSync('app/c/campus.css', 'utf8'), font = pathToFileURL('public/fonts/Archivo.ttf').href;
  const save = (name: string, model: Awaited<ReturnType<typeof campusScreen>>, openId?: string) => writeFileSync(`${process.env.PREVIEW_DIR}/${name}.html`,
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>@font-face{font-family:Archivo;src:url(${font});font-weight:100 900;font-stretch:62% 125%}:root{--font-archivo:Archivo}body{margin:0}${css}</style></head><body>${renderToStaticMarkup(<CampusScreen screen={model} signInHref="/sign-in" openId={openId} />)}</body></html>`);
  const { ana, ben, zeb, blitz } = await world(), [maya, dev, kai] = [await person('Maya Chen'), await person('Dev Patel'), await person('Kai Nakamura')];
  await group('Supper Club', ana, maya, dev, kai);
  await t.db.query("insert into campus_place(campus_id,name,other_names,lat,lon) values($1,'Northside Coffee','{}',42.4534,-76.4780),($1,'Arts Quad','{}',42.4488,-76.4845)", [cornell.id]);
  const cs = await event('CS 2110 study group', { host: 'Northside Coffee', place: 'Northside Coffee, the back table', about: 'Problem set 6, worked through together. Bring a laptop.', hours: 0.2 });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Northside Coffee', kind: 'group', listingId: cs, headCount: 3, texts: ['A drink and a pastry, $4.50 each', 'A drink and a pastry, $4.00 each'] });
  const mine = await imIn(t.db, ana.personId, cs);
  await joinByToken(t.db, maya.personId, mine.token); await joinByToken(t.db, dev.personId, mine.token);
  await checkIn(t.db, maya.personId, cs); await checkIn(t.db, dev.personId, cs);
  const run = await postPlan(t.db, kai.personId, cornell, { title: 'Sunset run, easy 5K', starts: new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 16), place: 'Arts Quad, meet at the statue', about: 'Conversation pace, nobody gets dropped.' });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Finger Lakes Running Co.', kind: 'building', texts: ['20% off Brooks running shoes'], rule: 'word', ruleCount: 5, ruleWord: 'run' });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Collegetown Bagels', kind: 'building', texts: ['$5 off any order'], rule: 'outings', ruleCount: 1 });
  const bao = await event('Dumpling night', { host: 'Bao House', place: 'Bao House', about: 'Order for the table and split it.', hours: 7 });
  await saveReward(t.db, { campusId: cornell.id, giver: 'Bao House', kind: 'group', listingId: bao, headCount: 4, texts: ['Starters on the house'] });
  const table = await imIn(t.db, maya.personId, bao); await joinByToken(t.db, dev.personId, table.token); await joinByToken(t.db, kai.personId, table.token);
  for (const [title, host, hours] of [['Resume drop-in', 'Career Services', 26], ['Ballroom open floor', 'Ballroom Dance Club', 30], ['Demo night', 'Ithaca builders', 52], ['Sunrise hike', 'Outing Club', 70]] as const) await event(title, { host, hours });
  // One earlier outing that counted, so there is something on the shelf.
  const past = await event('Morning run', { hours: 0.1 }), old = await imIn(t.db, ana.personId, past);
  await joinByToken(t.db, kai.personId, old.token); await checkIn(t.db, ana.personId, past); await checkIn(t.db, kai.personId, past);
  const photos = async () => Object.fromEntries([ana, ben, maya, dev, kai].map((each, at) => [each.personId, `https://i.pravatar.cc/120?img=${[12, 59, 47, 33, 15][at]}`]));
  save('out', await campusScreen(t.db, cornell, null, { photos }));
  save('in', await campusScreen(t.db, cornell, as(ana), { photos }));
  save('in-open', await campusScreen(t.db, cornell, as(ana), { photos }), cs);
  save('in-open-nomap', await campusScreen(t.db, cornell, as(ana), { photos }), blitz);
  save('in-initials', await campusScreen(t.db, cornell, as(ana, true), { photos: noPhotos }), run.id);
  // The admin's page, one file for each of its sections.
  vi.stubEnv('LOOP_ADMIN', 'ana@cornell.edu');
  for (const tab of ['events', 'rewards', 'feeds', 'places', 'tags', 'animals', 'premium', 'campus']) writeFileSync(`${process.env.PREVIEW_DIR}/admin-${tab}.html`,
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>@font-face{font-family:Archivo;src:url(${font});font-weight:100 900;font-stretch:62% 125%}:root{--font-archivo:Archivo}body{margin:0}${css}</style></head><body>${renderToStaticMarkup(await withPortalTestSession(ana, () => CampusAdminPage({ searchParams: Promise.resolve({ campus: 'cornell', tab, said: tab === 'animals' ? 'Premium now: people who subscribed can pick it.' : undefined }) })))}</body></html>`);
  expect(zeb.personId).toBeTruthy();
});
