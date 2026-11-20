import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AssistantsLink } from './assistants-link';
import { SiteFoot } from './foot';

// The foot has the small print only. Assistants, which first stood there (public/demo/mockups-foot-legal.html), is in
// the top bar, and is part of Ink+.
const server = vi.hoisted(() => ({ plus: vi.fn<() => Promise<boolean>>(), subscribe: vi.fn<(email: string) => Promise<boolean>>(), push: vi.fn() }));
vi.mock('./foot-actions', () => ({ hasInkPlusAction: server.plus, subscribeAtFootAction: server.subscribe }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: server.push, refresh: vi.fn() }) }));

beforeEach(() => { server.plus.mockReset(); server.subscribe.mockReset(); server.push.mockReset(); });
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

// Other schools' colours are an Ink+ perk (public/demo/mockups-ink-colours.html, "My pick"). Who may wear what is on the
// page (components/campus/kit.tsx): data-kits for someone signed in, data-any-kit with Ink+.
const lookAs = (kits: string | null, any = false) => { const root = document.documentElement.dataset; delete root.kits; delete root.anyKit; if (kits !== null) root.kits = kits; if (any) root.anyKit = ''; };
const dots = () => within(screen.getByRole('group', { name: 'Colours' })).getAllByRole('button').map(dot => dot.getAttribute('title'));

it('signed out, every school is a dot and nothing asks for Ink+', () => {
  lookAs(null);
  render(<SiteFoot />);
  expect(dots()).toEqual(['Loopd', 'Columbia', 'Cornell', 'CUNY', 'NYU']);
  expect(screen.queryByRole('button', { name: /Every school/ })).toBeNull();
});

it('without Ink+, the dots are Loopd and your school, and one pill opens the Ink+ card', () => {
  lookAs('loop cornell');
  render(<SiteFoot />);
  expect(dots()).toEqual(['Loopd', 'Cornell']);
  const pill = screen.getByRole('button', { name: /Every school/ });
  fireEvent.click(pill);
  const card = screen.getByRole('dialog', { name: "Every school's colours come with Ink+" });
  expect(pill).toHaveAttribute('aria-expanded', 'true');
  // What it does here, then what Ink+ is.
  expect(card).toHaveTextContent('The other 3 come with Ink+.');
  expect(card).toHaveTextContent('What Ink+ gives you');
  expect(card).toHaveTextContent('From $2.99 a month');
  expect(within(card).getByRole('link', { name: 'See Ink+' })).toHaveAttribute('href', '/c/ink');
  fireEvent.click(within(card).getByRole('button', { name: 'Not now' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(pill);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  lookAs(null);
});

it('with Ink+, every school is a dot and there is no pill', () => {
  lookAs('loop cornell', true);
  render(<SiteFoot />);
  expect(dots()).toHaveLength(5);
  expect(screen.queryByRole('button', { name: /Every school/ })).toBeNull();
  lookAs(null);
});

it('opens a card that says Assistants come with Ink+ for a member without it, and closes it again', async () => {
  server.plus.mockResolvedValue(false);
  render(<AssistantsLink />);
  expect(links()).toEqual(['AssistantsInk+']);
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

it('subscribes from the card with the email given, and then opens Assistants', async () => {
  server.plus.mockResolvedValue(false);
  render(<AssistantsLink />);
  fireEvent.click(screen.getByRole('link', { name: /Assistants/ }));
  const card = await screen.findByRole('dialog');
  // An email the server does not take is said so, and the card stays.
  server.subscribe.mockResolvedValueOnce(false);
  fireEvent.change(within(card).getByLabelText('Email'), { target: { value: 'ana@cornell.edu' } });
  fireEvent.click(within(card).getByRole('button', { name: 'Subscribe · $9.99' }));
  expect(await within(card).findByRole('alert')).toHaveTextContent('Enter the email to subscribe with.');
  expect(server.push).not.toHaveBeenCalled();
  server.subscribe.mockResolvedValueOnce(true);
  fireEvent.click(within(card).getByRole('button', { name: 'Subscribe · $9.99' }));
  await vi.waitFor(() => expect(server.push).toHaveBeenCalledWith('/groups/connections'));
  expect(server.subscribe).toHaveBeenLastCalledWith('ana@cornell.edu');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(links()).toEqual(['Assistants']);
});

it('takes a member with Ink+ to Assistants, and drops the tag', async () => {
  server.plus.mockResolvedValue(true);
  render(<AssistantsLink />);
  fireEvent.click(screen.getByRole('link', { name: /Assistants/ }));
  await vi.waitFor(() => expect(server.push).toHaveBeenCalledWith('/groups/connections'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(links()).toEqual(['Assistants']);
});

it('leaves Assistants a plain link when it cannot be asked', async () => {
  server.plus.mockRejectedValue(new Error('offline'));
  render(<AssistantsLink />);
  fireEvent.click(screen.getByRole('link', { name: /Assistants/ }));
  await vi.waitFor(() => expect(server.push).toHaveBeenCalledWith('/groups/connections'));
});
