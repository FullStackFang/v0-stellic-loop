import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AssistantsLink } from './assistants-link';
import { SiteFoot } from './foot';

// The foot has the small print only. Assistants, which first stood there (public/demo/mockups-foot-legal.html), is in
// the top bar, and is part of Ink+.
const server = vi.hoisted(() => ({ plan: vi.fn(async () => 'free'), plus: vi.fn<() => Promise<boolean>>(), push: vi.fn() }));
vi.mock('./foot-actions', () => ({ planHereAction: server.plan, hasInkPlusAction: server.plus }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: server.push, refresh: vi.fn() }) }));

beforeEach(() => { server.plus.mockReset(); server.push.mockReset(); });
afterEach(cleanup);
const links = () => screen.getAllByRole('link').map(link => link.textContent);

it('has the small print only', () => {
  render(<SiteFoot />);
  expect(links()).toEqual(['Loopd', 'Terms', 'Privacy']);
});

// The crowd ticket moved to Seats (openspec/changes/loop-foot-crowd-to-seats): the foot is the bar alone.
it('has no ticket and no crowd', () => {
  const { container } = render(<SiteFoot />);
  expect(screen.queryByText('Pick one up')).toBeNull();
  expect(screen.queryByText('Admit everyone')).toBeNull();
  expect(container.querySelectorAll('img')).toHaveLength(0);
});

it('rings the colours picked', async () => {
  render(<SiteFoot />);
  const cornell = screen.getByRole('button', { name: /^Cornell/ });
  fireEvent.click(cornell);
  await vi.waitFor(() => expect(cornell).toHaveAttribute('aria-pressed', 'true'));
  expect(document.documentElement.dataset.kit).toBe('cornell');
  delete document.documentElement.dataset.kit;
});

// Each dot says its school: the one on is open with its name, and a face pointed at is named with its school
// (public/demo/mockups-school-labels.html, foot C and faces A).
it('names the colours, and the school of a face pointed at', async () => {
  render(<><SiteFoot /><img alt='Ben' src='/animals/01.png' data-who='Ben' data-school='Cornell' data-school-kit='cornell' /></>);
  expect(screen.getByRole('button', { name: 'Cornell colours' })).toHaveTextContent('Cornell');
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.pointerOver(screen.getByRole('img', { name: 'Ben' }));
  const tag = await screen.findByRole('tooltip');
  expect(tag).toHaveTextContent('BenCornell');
  expect(tag.querySelector('[data-kit=cornell]')).not.toBeNull();
  fireEvent.pointerOut(screen.getByRole('img', { name: 'Ben' }));
  await vi.waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
});

// Other schools' colours are an Ink+ perk (public/demo/mockups-ink-colours.html, "My pick"). Who may wear what is on the
// page (components/campus/kit.tsx): data-kits for someone signed in, data-any-kit with Ink+.
const lookAs = (kits: string | null, any = false) => { const root = document.documentElement.dataset; delete root.kits; delete root.anyKit; if (kits !== null) root.kits = kits; if (any) root.anyKit = ''; };
const dots = () => within(screen.getByRole('group', { name: 'Colours' })).getAllByRole('button').map(dot => dot.textContent);

it('signed out, every school is a dot and nothing asks for Ink+', () => {
  lookAs(null);
  render(<SiteFoot />);
  expect(dots()).toEqual(['Loopd', 'Columbia', 'Cornell', 'CUNY', 'NYU']);
  expect(screen.queryByRole('button', { name: /Every school/ })).toBeNull();
});

it('without Ink, the dots are Loopd and your school, and one pill opens the Ink card', () => {
  lookAs('loop cornell');
  render(<SiteFoot />);
  expect(dots()).toEqual(['Loopd', 'Cornell']);
  // Wearing any school's colours is making it yours: Ink (public/demo/mockups-ink-buttons.html). The pill wears the Ink mark.
  const pill = screen.getByRole('button', { name: 'Every school, with Ink' });
  expect(pill).not.toHaveTextContent('Ink');
  fireEvent.click(pill);
  const card = screen.getByRole('dialog', { name: "Every school's colours come with Ink" });
  expect(pill).toHaveAttribute('aria-expanded', 'true');
  // The one ask card names its plan and says only what that plan gives: no Ink+, and the price is on the one Get button.
  expect(card).toHaveTextContent('The other 3 come with Ink');
  expect(card).not.toHaveTextContent('Ink+');
  expect(card).not.toHaveTextContent('$9.99');
  expect(within(card).getByRole('button', { name: 'Get Ink · $2.99' })).toBeInTheDocument();
  fireEvent.click(within(card).getByRole('button', { name: 'Not now' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(pill);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  lookAs(null);
});

it('signs up for Ink from the colours card, recording where, and thanks them', async () => {
  lookAs('loop cornell');
  const posted = vi.fn(async (_: string, init: RequestInit) => new Response(JSON.stringify({ ok: true, said: 'Thanks for your interest. This isn’t ready yet, so we’ve upgraded you to Ink for now.', sent: init.body })));
  vi.stubGlobal('fetch', posted);
  render(<SiteFoot />);
  fireEvent.click(screen.getByRole('button', { name: 'Every school, with Ink' }));
  fireEvent.click(screen.getByRole('button', { name: 'Get Ink · $2.99' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Thanks for your interest. This isn’t ready yet, so we’ve upgraded you to Ink for now.');
  expect(posted).toHaveBeenCalledWith('/c/ink/join', expect.objectContaining({ method: 'POST' }));
  expect(JSON.parse(String(posted.mock.calls[0][1].body))).toMatchObject({ plan: 'ink', place: 'colours: Get Ink' });
  // Signed up, Not now steps aside for the thanks.
  vi.unstubAllGlobals();
  lookAs(null);
});

it('signed out, opens the sign-in card in the colours card itself, and holds the plan until they are back', async () => {
  lookAs('loop cornell');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, signIn: '/sign-in', schools: [], configured: false }), { status: 401 })));
  render(<SiteFoot />);
  fireEvent.click(screen.getByRole('button', { name: 'Every school, with Ink' }));
  fireEvent.click(screen.getByRole('button', { name: 'Get Ink · $2.99' }));
  const card = screen.getByRole('dialog');
  expect(await within(card).findByText('held for you')).toBeInTheDocument();
  expect(card).toHaveTextContent('Sign in');
  expect(JSON.parse(localStorage.getItem('loopd-held-ink')!)).toMatchObject({ plan: 'ink', place: 'colours: Get Ink' });
  // Back gives the Get button again; the plan stays held.
  fireEvent.click(within(card).getByRole('button', { name: 'Back' }));
  expect(within(card).getByRole('button', { name: 'Get Ink · $2.99' })).toBeInTheDocument();
  localStorage.clear(); vi.unstubAllGlobals();
  lookAs(null);
});

it('with Ink, every school is a dot and there is no pill', () => {
  lookAs('loop cornell', true);
  render(<SiteFoot />);
  expect(dots()).toHaveLength(5);
  expect(screen.queryByRole('button', { name: /Every school/ })).toBeNull();
  lookAs(null);
});

it('opens a card that says Assistants come with Ink+ for a member without it, and closes it again', async () => {
  server.plus.mockResolvedValue(false);
  render(<AssistantsLink />);
  // It wears the Ink+ mark in place of the plan's name.
  expect(links()).toEqual(['Assistants']);
  expect(screen.getByRole('link', { name: 'Assistants, with Ink+' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: /Assistants/ }));
  const card = await screen.findByRole('dialog', { name: 'Assistants come with Ink+' });
  expect(server.push).not.toHaveBeenCalled();
  fireEvent.click(within(card).getByRole('button', { name: 'Not now' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: /Assistants/ }));
  await screen.findByRole('dialog');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(server.plus).toHaveBeenCalledTimes(1);
});

it('tells someone on Ink what Ink+ adds, and what it costs in place of Ink', async () => {
  server.plus.mockResolvedValue(false); server.plan.mockResolvedValueOnce('ink');
  render(<AssistantsLink />);
  fireEvent.click(screen.getByRole('link', { name: /Assistants/ }));
  const card = await screen.findByRole('dialog');
  await vi.waitFor(() => expect(card).toHaveTextContent('in place of Ink’s $2.99. Your Ink stays.'));
  expect(within(card).getByRole('button', { name: 'Get Ink+ · $9.99' })).toBeInTheDocument();
});

it('signs up from the card in one press, with no email to type, and then opens Assistants', async () => {
  server.plus.mockResolvedValue(false);
  const posted = vi.fn(async () => new Response(JSON.stringify({ ok: true, said: 'Thanks for your interest.' })));
  vi.stubGlobal('fetch', posted);
  render(<AssistantsLink />);
  fireEvent.click(screen.getByRole('link', { name: /Assistants/ }));
  const card = await screen.findByRole('dialog');
  expect(within(card).queryByLabelText('Email')).toBeNull();
  fireEvent.click(within(card).getByRole('button', { name: 'Get Ink+ · $9.99' }));
  expect(await within(card).findByRole('status')).toHaveTextContent('Thanks for your interest.');
  expect(JSON.parse(String((posted.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ plan: 'plus', place: 'assistants: Get Ink+' });
  expect(server.push).not.toHaveBeenCalled();
  fireEvent.click(within(card).getByRole('button', { name: 'Open Assistants' }));
  expect(server.push).toHaveBeenCalledWith('/groups/connections');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(links()).toEqual(['Assistants']);
  vi.unstubAllGlobals();
});

it('takes a member with Ink+ to Assistants, and drops the tag', async () => {
  server.plus.mockResolvedValue(true);
  render(<AssistantsLink />);
  fireEvent.click(screen.getByRole('link', { name: /Assistants/ }));
  await vi.waitFor(() => expect(server.push).toHaveBeenCalledWith('/groups/connections'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(links()).toEqual(['Assistants']);
});

it('shows the small one on the link while a press waits for the server', async () => {
  let answer: (has: boolean) => void = () => {};
  server.plus.mockReturnValue(new Promise<boolean>(done => { answer = done; }));
  render(<AssistantsLink />);
  const link = screen.getByRole('link', { name: /Assistants/ });
  expect(link.querySelector('.seats-sm')).toBeNull();
  fireEvent.click(link);
  await vi.waitFor(() => expect(link.querySelector('.seats-sm')).not.toBeNull());
  answer(false);
  await screen.findByRole('dialog');
  expect(link.querySelector('.seats-sm')).toBeNull();
});

it('is a plain link from the start for someone the page knows has Ink+: nothing is asked, nothing is waited for', () => {
  render(<AssistantsLink plus />);
  expect(screen.getByRole('link', { name: 'Assistants' })).toHaveAttribute('href', '/groups/connections');
  expect(fireEvent.click(screen.getByRole('link', { name: 'Assistants' }))).toBe(true);
  expect(server.plus).not.toHaveBeenCalled();
  expect(server.push).not.toHaveBeenCalled();
});

it('leaves Assistants a plain link when it cannot be asked', async () => {
  server.plus.mockRejectedValue(new Error('offline'));
  render(<AssistantsLink />);
  fireEvent.click(screen.getByRole('link', { name: /Assistants/ }));
  await vi.waitFor(() => expect(server.push).toHaveBeenCalledWith('/groups/connections'));
});
