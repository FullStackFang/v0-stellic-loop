import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Screen } from '@/lib/campus/view';
import { CampusScreen } from './screen';
import { inside, landOf } from '@/lib/campus/sections';
import { schoolOf } from '@/lib/campus/schools';
import { Swap, visiting, type SwapCampus } from './swap';

const actions = vi.hoisted(() => ({ changeCampusAction: vi.fn(async () => ({ ok: true }) as { ok: boolean; message?: string }) }));
vi.mock('@/app/c/actions', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('maplibre-gl', () => ({ default: {} }));

afterEach(cleanup);

const ithaca: SwapCampus = { slug: 'cornell', title: 'Ithaca', line: 'The hill, Collegetown, downtown', mark: 'tower', count: 212, home: true, here: true };
const newYork: SwapCampus = { slug: 'cornell-tech', title: 'New York', line: 'Cornell Tech and Roosevelt Island', mark: 'tram', count: 38, home: false, here: false };

describe('The tag that swaps campus', () => {
  it('names the campus on the page, and opens a ticket per campus: the one you are on is not a link', () => {
    render(<Swap campuses={[ithaca, newYork]} />);
    const tag = screen.getByRole('button', { name: 'Your campus: Ithaca. Swap campus' });
    expect(screen.queryByRole('group', { name: 'Campuses' })).toBeNull();
    fireEvent.click(tag);
    const menu = screen.getByRole('group', { name: 'Campuses' });
    expect(within(menu).getByRole('link', { name: /38 on this week.*New York.*Look/ })).toHaveAttribute('href', '/c/cornell-tech');
    expect(within(menu).queryByRole('link', { name: /Ithaca/ })).toBeNull();
    expect(within(menu).getByText('Your campus · 212 on this week')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Campuses' })).toBeNull();
  });

  it('says "Visiting" on a campus that is not your own, and offers the way back', () => {
    const away = [{ ...ithaca, here: false }, { ...newYork, here: true }];
    expect(visiting(away)).toBe(true);
    render(<Swap campuses={away} />);
    fireEvent.click(screen.getByRole('button', { name: 'Visiting: New York. Swap campus' }));
    expect(screen.getByRole('link', { name: /Ithaca/ })).toHaveAttribute('href', '/c/cornell');
  });

  it('is not visiting for someone with no campus of their own, and is not drawn for a school with one campus', () => {
    expect(visiting([{ ...ithaca, home: false }, newYork])).toBe(false);
    expect(visiting([ithaca, newYork])).toBe(false);
    const { container } = render(<Swap campuses={[ithaca]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('Cornell Tech', () => {
  it('is part of Cornell, and has Roosevelt Island as its first section with the campus inside it', () => {
    expect(schoolOf('cornell-tech')).toBe('cornell');
    expect(schoolOf('cornell')).toBe('cornell');
    const land = landOf('cornell-tech')!;
    expect(land[0].id).toBe('roosevelt');
    expect(inside(land[0].rest, land[0].ring)).toBe(true);
    expect(inside([-73.9561, 40.7557], land[0].ring)).toBe(true);   // the Bloomberg Center
    expect(inside([-73.9862, 40.7484], land[0].ring)).toBe(false);  // Manhattan
  });
});

describe('"Change campus" in the account card', () => {
  const viewer = { first: 'Sam', name: 'Sam Lee', photo: null, face: 0, ownPhoto: null, own: null, owns: [], picks: { core: [], premium: [], school: [] }, schools: { profile: null, home: null, added: [], all: [] }, asked: false, makesLeft: 0, level: 0, outings: 0, admin: false, groups: [] } as unknown as NonNullable<Screen['viewer']>;
  const model: Screen = { campus: { slug: 'cornell', name: 'Cornell', tz: 'America/New_York', listSource: 'CampusGroups' }, viewer, tickets: [], earning: [], live: null, places: [] };
  const card = (swap?: SwapCampus[]) => { render(<CampusScreen screen={model} swap={swap} signInHref="/sign-in" />); fireEvent.click(screen.getByRole('button', { name: /Show your level/ })); };

  it('names your campus and moves you to the other one with one press', async () => {
    const assign = vi.fn(); vi.stubGlobal('location', { ...window.location, assign });
    card([ithaca, newYork]);
    expect(screen.getByText('Your campus is Ithaca')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Change to New York' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/c/cornell-tech'));
    expect(actions.changeCampusAction).toHaveBeenCalledWith('cornell-tech');
    vi.unstubAllGlobals();
  });

  it('says why when the move is refused, and stays', async () => {
    actions.changeCampusAction.mockResolvedValueOnce({ ok: false, message: 'That campus is not part of your school.' });
    card([{ ...ithaca, home: false, here: false }, { ...newYork, home: true, here: true }]);
    fireEvent.click(screen.getByRole('button', { name: 'Change to Ithaca' }));
    expect(await screen.findByText('That campus is not part of your school.')).toBeTruthy();
  });

  it('is not there for a school with one campus, or for someone with no campus of their own', () => {
    card();
    expect(screen.queryByRole('button', { name: /^Change to/ })).toBeNull();
    cleanup();
    card([{ ...ithaca, home: false }, newYork]);
    expect(screen.queryByRole('button', { name: /^Change to/ })).toBeNull();
  });
});
