import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makePerson, openTestDb, type TestDb } from '@/test/db';
import { authenticate, type Principal } from '@/lib/emba/access';
import type { PageRead } from '@/lib/emba/event-link';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { CampusScreen } from '@/components/campus/screen';
import { findCampus, weekListings, type Campus } from '@/lib/campus/listings';
import { campusScreen } from '@/lib/campus/screen';
import { localInput } from '@/lib/campus/time';
import { postPlanAction, readPlanLinkAction } from './actions';
import PostPlanPage from './[campus]/post/page';

// Spec: openspec/changes/loop-group-event-links/specs/campus-event-links. The event page is never requested here.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const read = vi.hoisted(() => ({ page: vi.fn<(url: string) => Promise<PageRead>>() }));
vi.mock('@/lib/emba/event-link', async original => ({ ...(await original<typeof import('@/lib/emba/event-link')>()), readEventPage: read.page }));

let t: TestDb, cornell: Campus;
beforeAll(async () => { t = await openTestDb(); });
afterAll(async () => { await t?.close(); });
beforeEach(async () => { await t.reset(); cornell = (await findCampus(t.db, 'cornell'))!; read.page.mockReset(); });
afterEach(() => { cleanup(); });

async function person(name: string, email = `${name.split(' ')[0].toLowerCase()}@cornell.edu`): Promise<Principal> {
  const row = await makePerson(t.db, name);
  await t.db.query("insert into emba_identity(issuer,subject,person_id,verified_at) values('https://issuer.test',$1,$2,now())", [row.id, row.id]);
  return (await authenticate(t.db, 'test', async () => ({ issuer: 'https://issuer.test', subject: row.id, expiresAt: Date.parse('2099-01-01'), verifiedEmail: email })))!;
}
const LUMA = 'https://lu.ma/4mkwpko0';
// Tomorrow, on the minute.
const starts = new Date(Math.floor(Date.now() / 60000) * 60000 + 26 * 3600000), ends = new Date(starts.getTime() + 2 * 3600000);
const celebration: PageRead = { ok: true, facts: { name: 'Special Special 10 Year Celebration', startsAt: starts.toISOString(), endsAt: ends.toISOString(), place: '40 E 1st St', host: 'Special Special' } };
const post = () => PostPlanPage({ params: Promise.resolve({ campus: 'cornell' }), searchParams: Promise.resolve({}) });
const sentTo = (path: string) => expect.objectContaining({ digest: expect.stringContaining(`;${path};`) });
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries({ campus: 'cornell', ...fields })) data.set(key, value); return data; };

it('fills the post form from a pasted link, shows the link that is kept, and lets the person drop it', async () => {
  const ana = await person('Ana Lopez');
  read.page.mockResolvedValue(celebration);
  await withPortalTestSession(ana, async () => {
    render(await post());
    const box = screen.getByRole('textbox', { name: /Found it somewhere/ }), fill = screen.getByRole('button', { name: 'Fill in' });
    expect(fill).toBeDisabled();
    fireEvent.change(box, { target: { value: 'lu.ma/4mkwpko0?utm_source=whatsapp' } });
    fireEvent.click(fill);
    expect(await screen.findByText('Read from lu.ma. Check it, then post it.')).toBeInTheDocument();
  });
  expect(read.page).toHaveBeenCalledWith(LUMA);
  expect(screen.getByRole('textbox', { name: 'What is the plan?' })).toHaveValue('Special Special 10 Year Celebration');
  expect(screen.getByLabelText('Starts')).toHaveValue(localInput(cornell.tz, starts));
  expect(screen.getByLabelText(/^Ends/)).toHaveValue(localInput(cornell.tz, ends));
  expect(screen.getByRole('textbox', { name: /^Where/ })).toHaveValue('40 E 1st St');
  expect(screen.getByRole('textbox', { name: /^One line about it/ })).toHaveValue('Hosted by Special Special');
  expect(screen.getByText('lu.ma/4mkwpko0')).toBeInTheDocument();
  expect(document.querySelector('input[name="link"]')).toHaveValue(LUMA);
  expect(screen.getByRole('textbox', { name: /Found it somewhere/ })).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));
  expect(document.querySelector('input[name="link"]')).toBeNull();
  // What was filled in stays: it is the person's plan now.
  expect(screen.getByRole('textbox', { name: 'What is the plan?' })).toHaveValue('Special Special 10 Year Celebration');
});

it('keeps what the person typed when the page cannot be read, and says why a link cannot be used', async () => {
  const ana = await person('Ana Lopez');
  await withPortalTestSession(ana, async () => {
    render(await post());
    fireEvent.change(screen.getByRole('textbox', { name: 'What is the plan?' }), { target: { value: 'Rooftop birthday' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Found it somewhere/ }), { target: { value: 'https://partiful.com/e/abc123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill in' }));
    expect(await screen.findByText('Loop does not read partiful.com. The link is kept: fill in the rest.')).toBeInTheDocument();
    expect(read.page).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'What is the plan?' })).toHaveValue('Rooftop birthday');
    expect(document.querySelector('input[name="link"]')).toHaveValue('https://partiful.com/e/abc123');
    read.page.mockResolvedValue({ ok: false, reason: 'gone' });
    fireEvent.change(screen.getByRole('textbox', { name: /Found it somewhere/ }), { target: { value: LUMA } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That page is gone, or says the event is off.');
    // The link kept before is still the plan's link.
    expect(document.querySelector('input[name="link"]')).toHaveValue('https://partiful.com/e/abc123');
  });
});

it('reading a link is for a signed-in person on their own campus', async () => {
  const noor = await person('Noor Haddad', 'noor@stern.nyu.edu');
  expect(await readPlanLinkAction('cornell', LUMA)).toEqual({ ok: false, message: 'Sign in to continue.' });
  expect(await withPortalTestSession(noor, () => readPlanLinkAction('cornell', LUMA))).toMatchObject({ ok: false, message: expect.stringContaining("another school's list") });
  expect(read.page).not.toHaveBeenCalled();
});

it('posts the plan with its link, shows the event page on the list, and a second person posting the link is counted in', async () => {
  const ana = await person('Ana Lopez'), ben = await person('Ben Okafor'), fields = { title: 'Special Special 10 Year Celebration', starts: localInput(cornell.tz, starts), link: LUMA };
  await expect(withPortalTestSession(ana, () => postPlanAction({ message: '' }, form(fields)))).rejects.toEqual(sentTo('/c/cornell'));
  await expect(withPortalTestSession(ben, () => postPlanAction({ message: '' }, form({ ...fields, title: 'Typed again' })))).rejects.toEqual(sentTo('/c/cornell'));
  const list = await weekListings(t.db, cornell);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ title: 'Special Special 10 Year Celebration', link: LUMA, going: 2, postedBy: ana.personId });
  render(<CampusScreen signInHref="/sign-in" screen={await campusScreen(t.db, cornell, { personId: ben.personId, admin: false })} />);
  fireEvent.click(screen.getByRole('button', { name: /Details/ }));
  expect(screen.getByRole('link', { name: 'lu.ma' })).toHaveAttribute('href', LUMA);
});
