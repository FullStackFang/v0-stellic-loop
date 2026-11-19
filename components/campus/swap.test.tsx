import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { inside, landOf } from '@/lib/campus/sections';
import { schoolOf } from '@/lib/campus/schools';
import { Swap, visiting, type SwapCampus } from './swap';

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
  it('is part of Cornell, and has Roosevelt Island as its one section with the campus inside it', () => {
    expect(schoolOf('cornell-tech')).toBe('cornell');
    expect(schoolOf('cornell')).toBe('cornell');
    const land = landOf('cornell-tech')!;
    expect(land.map(each => each.id)).toEqual(['roosevelt']);
    expect(inside(land[0].rest, land[0].ring)).toBe(true);
    expect(inside([-73.9561, 40.7557], land[0].ring)).toBe(true);   // the Bloomberg Center
    expect(inside([-73.9862, 40.7484], land[0].ring)).toBe(false);  // Manhattan
  });
});
