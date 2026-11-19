import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SiteFoot } from './foot';

// The links at the foot (public/demo/mockups-foot-legal.html): Assistants, Terms, Privacy. Assistants is part of Ink+.
const server = vi.hoisted(() => ({ plus: vi.fn<() => Promise<boolean>>(), subscribe: vi.fn<(email: string) => Promise<boolean>>(), push: vi.fn() }));
vi.mock('./foot-actions', () => ({ hasInkPlusAction: server.plus, subscribeAtFootAction: server.subscribe }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: server.push, refresh: vi.fn() }) }));

beforeEach(() => { server.plus.mockReset(); server.subscribe.mockReset(); server.push.mockReset(); });
afterEach(cleanup);
const links = () => within(screen.getByRole('contentinfo')).getAllByRole('link').map(link => link.textContent);

it('has the small print only for someone in no group', () => {
  render(<SiteFoot />);
  expect(links()).toEqual(['Loop', 'Terms', 'Privacy']);
});

it('opens a card that says Assistants come with Ink+ for a member without it, and closes it again', async () => {
  server.plus.mockResolvedValue(false);
  render(<SiteFoot member />);
  expect(links()).toEqual(['Loop', 'AssistantsInk+', 'Terms', 'Privacy']);
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
  render(<SiteFoot member />);
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
  expect(links()).toEqual(['Loop', 'Assistants', 'Terms', 'Privacy']);
});

it('takes a member with Ink+ to Assistants, and drops the tag', async () => {
  server.plus.mockResolvedValue(true);
  render(<SiteFoot member />);
  fireEvent.click(screen.getByRole('link', { name: /Assistants/ }));
  await vi.waitFor(() => expect(server.push).toHaveBeenCalledWith('/groups/connections'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(links()).toEqual(['Loop', 'Assistants', 'Terms', 'Privacy']);
});

it('leaves Assistants a plain link when it cannot be asked', async () => {
  server.plus.mockRejectedValue(new Error('offline'));
  render(<SiteFoot member />);
  fireEvent.click(screen.getByRole('link', { name: /Assistants/ }));
  await vi.waitFor(() => expect(server.push).toHaveBeenCalledWith('/groups/connections'));
});
