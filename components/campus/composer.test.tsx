import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Spot } from '@/lib/campus/view';
import { Composer } from './composer';

// Spec: openspec/changes/campus-plan-place-and-time/specs/campus-screen, "Picking where to meet".
vi.mock('@/app/c/actions', () => ({ postLineAction: vi.fn(), readPlanLinkAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);

const spot = (name: string, tag: string, kind: Spot['kind'], used = 0): Spot => ({ name, tag, kind, lat: 40.76, lon: -73.95, used });
const SPOTS = [spot('Southpoint Park', 'southpoint', 'park', 3), spot('Lighthouse Park', 'lighthouse', 'park'), spot('Firefighters Field', 'firefighters', 'sport', 1), spot('Pinks Cantina', 'pinks', 'food')];
const tech = { slug: 'cornell-tech', name: 'Cornell Tech', tz: 'America/New_York' };
const open = (spots: Spot[] = SPOTS) => render(<Composer campus={tech} tags={[]} soon={[]} onDone={() => {}} onReview={() => {}} spots={spots} />);
const line = () => screen.getByLabelText('What are you up to?') as HTMLTextAreaElement;
const say = (text: string) => fireEvent.change(line(), { target: { value: text } });
const post = () => screen.getByRole('button', { name: 'Post it' });
const where = () => document.querySelector('.cs-where') as HTMLElement;
const pills = () => [...document.querySelectorAll('.cs-box .cs-place')].map(each => each.textContent);

describe('picking where to meet', () => {
  it('waits for a place: the where line asks, and Post cannot be pressed', () => {
    open(); say('Jogging around roosevelt island');
    expect(within(where()).getByText('Where do you meet?')).toBeInTheDocument();
    expect(post()).toBeDisabled();
  });
  it('writes the pressed place into the line, and a second press replaces it', () => {
    open(); say('Jogging around roosevelt island');
    fireEvent.click(screen.getByRole('button', { name: 'Parks' }));
    expect(pills()).toEqual(['Southpoint Park', 'Lighthouse Park']);
    fireEvent.click(screen.getByRole('button', { name: 'Southpoint Park' }));
    expect(line().value).toBe('Jogging around roosevelt island @southpoint ');
    expect(where()).toHaveTextContent('Meet at Southpoint Park');
    expect(post()).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Lighthouse Park' }));
    expect(line().value).toContain('@lighthouse');
    expect(line().value).not.toContain('@southpoint');
  });
  it('narrows the pills to the places matching part of a name typed after an @, from every kind', () => {
    open(); say('run @fi');
    expect(screen.getByRole('button', { name: 'Matching @fi' })).toBeInTheDocument();
    expect(pills()).toEqual(['Firefighters Field']);
    fireEvent.click(screen.getByRole('button', { name: 'Firefighters Field' }));
    expect(line().value).toBe('run @firefighters ');
  });
  it('takes a typed @ that is a place as the place, and keeps one that is not as a tag but still asks', () => {
    open(); say('tacos @pinks ');
    expect(where()).toHaveTextContent('Meet at Pinks Cantina');
    say('drinks @rooftop ');
    expect(where()).toHaveTextContent('@rooftop stays as a tag');
    expect(post()).toBeDisabled();
  });
  it('lists the places most used under Near you when the browser gives no location', () => {
    open(); say('run');
    expect(pills().slice(0, 2)).toEqual(['Southpoint Park', 'Firefighters Field']);
  });
  it('is as before on a campus that does not require places', () => {
    open([]); say('run tomorrow 7am');
    expect(where()).toBeNull();
    expect(screen.queryByText('Where do you meet?')).toBeNull();
    expect(post()).toBeEnabled();
  });
});
