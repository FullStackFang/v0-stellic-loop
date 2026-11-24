import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Face, Screen, Ticket } from '@/lib/campus/view';
import { CampusScreen } from './screen';

// Spec: openspec/changes/campus-plan-place-and-time (plan-time-settling, campus-screen "People in the source bar").
const actions = vi.hoisted(() => ({
  pickTimeAction: vi.fn(async () => ({ ok: true })), setTimeAction: vi.fn(async () => ({ ok: true })), cancelPlanAction: vi.fn(async () => ({ ok: true })),
  imInAction: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/app/c/actions', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('maplibre-gl', () => ({ default: {} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const face = (first: string): Face => ({ first, photo: `/animals/${first}.webp`, plan: 'free' });
const times = (marks: Record<string, string[]> = {}) => ['07:00', '09:00', '12:00', '17:00', '19:00'].map((at, n) => ({ at, label: ['7am', '9am', '12pm', '5pm', '7pm'][n], count: marks[at]?.length ?? 0, mine: false, faces: (marks[at] ?? []).map(face) }));
function ticket(id: string, more: Partial<Ticket> = {}): Ticket {
  return { id, title: id, day: 'Tue', mapDate: '2026-11-24', mapDay: 'Tue', time: '7pm', ends: null, when: '2026-11-24T05:00:00Z', source: null, by: null, place: null, about: null, link: null, tags: [], map: null,
    words: [], pull: 0, going: 1, stub: { kind: 'none', say: 'Nobody is in yet', faces: [] }, how: null, known: [], mine: null, action: 'in', status: null, joinToken: null,
    member: false, byFace: null, timeOpen: null, setBy: null, deal: null, ...more };
}
const mine = (members = 1): Ticket['mine'] => ({ token: 't', registered: false, here: false, members: Array.from({ length: members }, (_, n) => face(`P${n}`)), choices: [], canLeave: true, canEdit: true, canCancel: true });
const run = (more: Partial<Ticket>) => ticket('Run around the island', { member: true, by: 'Posted by Alex', time: '?', byFace: face('Alex'), ...more });
const viewer = { first: 'Sam', name: 'Sam Lee', photo: null, face: 0, ownPhoto: null, own: null, owns: [], personal: [], picks: { core: [], premium: [], school: [] }, schools: { profile: null, home: 'columbia', added: [], all: [] }, asked: false, makesLeft: 0, plan: 'free', anyKit: false, level: 0, outings: 0, admin: false, groups: [] } as unknown as NonNullable<Screen['viewer']>;
const show = (tickets: Ticket[]) => render(<CampusScreen screen={{ campus: { slug: 'columbia', name: 'Columbia', tz: 'America/New_York', listSource: 'CampusGroups' }, viewer, tickets, earning: [], live: null, places: [], spots: [] }} signInHref="/sign-in" />);
const when = () => document.querySelector('.cs-when') as HTMLElement;

describe('a plan whose time is not set', () => {
  it('shows "?" for its time, and asks the people in it when works, one press per time', async () => {
    show([run({ mine: mine(2), action: null, status: "You're in", timeOpen: { day: '2026-11-24', poster: false, answered: 1, of: 2, times: times({ '07:00': ['Jo'] }) } })]);
    expect(document.querySelector('.cs-tile.open b')).toHaveTextContent('?');
    expect(within(when()).getByText('When works for you?')).toBeInTheDocument();
    expect(within(when()).getAllByRole('button').map(each => each.textContent?.replace(/nobody|Jo/g, ''))).toEqual(['7am', '9am', '12pm', '5pm', '7pm']);
    expect(within(when()).getByRole('img', { name: 'Jo' })).toBeInTheDocument();
    fireEvent.click(within(when()).getByRole('button', { name: /^5pm/ }));
    await waitFor(() => expect(actions.pickTimeAction).toHaveBeenCalledWith('Run around the island', '17:00'));
  });
  it('shows nothing to pick to someone not in it', () => {
    show([run({ timeOpen: { day: '2026-11-24', poster: false, answered: 0, of: 1, times: times() } })]);
    expect(when()).toBeNull();
  });
  it('lets the poster send the time most marked, or another they press, and not before anyone answers', async () => {
    const posted = (marks: Record<string, string[]>) => run({ mine: mine(3), action: null, status: "You're in", timeOpen: { day: '2026-11-24', poster: true, answered: Object.values(marks).flat().length ? 2 : 0, of: 2, times: times(marks) } });
    show([posted({})]);
    expect(within(when()).getByText('Pick a time')).toBeInTheDocument();
    expect(within(when()).getByRole('button', { name: 'Send' })).toBeDisabled();
    cleanup();
    show([posted({ '07:00': ['Jo', 'Kim'], '17:00': ['Kim'] })]);
    expect(within(when()).getByRole('button', { name: /^7am/ })).toHaveClass('best');
    fireEvent.click(within(when()).getByRole('button', { name: /^5pm/ }));
    fireEvent.click(within(when()).getByRole('button', { name: 'Send 5pm' }));
    await waitFor(() => expect(actions.setTimeAction).toHaveBeenCalledWith('Run around the island', '17:00'));
  });
  it('tells the people in it who set the time', () => {
    show([run({ time: '7am', mine: mine(2), action: null, status: "You're in", setBy: 'Alex set it: Tue at 7am.' })]);
    expect(screen.getByText('Alex set it: Tue at 7am.')).toBeInTheDocument();
  });
});

it('"People" shows only the plans people posted', () => {
  show([run({ time: '7am' }), ticket('Watercolor Workshop', { source: 'CampusGroups', action: 'register' })]);
  expect(screen.getByRole('heading', { level: 3, name: 'Watercolor Workshop' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'People' }));
  expect(screen.queryByRole('heading', { level: 3, name: 'Watercolor Workshop' })).toBeNull();
  expect(screen.getByRole('heading', { level: 3, name: 'Run around the island' })).toBeInTheDocument();
});

it('lets the poster cancel their plan, with a second press to say yes', async () => {
  show([run({ time: '7pm', mine: mine(1), action: 'checkin' })]);
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel this plan' }));
  expect(actions.cancelPlanAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
  await waitFor(() => expect(actions.cancelPlanAction).toHaveBeenCalledWith('Run around the island'));
});
