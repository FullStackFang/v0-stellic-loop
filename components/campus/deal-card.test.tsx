import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CampusScreen } from './screen';
import { landOf, sectionAt } from '@/lib/campus/sections';
import type { Screen, Seat, Stub, Ticket } from '@/lib/campus/view';

// Spec: openspec/changes/campus-deals/specs/campus-deals: "The deal card leads with the deal", "In the week list, a deal
// shows only to people standing near it", and the seats that come through unchanged. The map is stood in for, as in near.test.tsx.
const maps: { box: HTMLElement }[] = [];
class FakeMap {
  box: HTMLElement; center: { lng: number; lat: number }; zoom: number; min = 0; handlers: Record<string, ((event: object) => void)[]> = {};
  touchZoomRotate = { disableRotation() {} };
  constructor(options: { container: HTMLElement; center: [number, number]; zoom: number }) { this.box = options.container; this.center = { lng: options.center[0], lat: options.center[1] }; this.zoom = options.zoom; maps.push(this); }
  on(type: string, handler: (event: object) => void) { (this.handlers[type] ??= []).push(handler); return this; }
  once(_type: string, handler: (event: object) => void) { handler({}); return this; }
  fire(type: string) { for (const handler of this.handlers[type] ?? []) handler({}); }
  getSource() { return { setData() {} }; } hasImage() { return false; } addImage() {} setPaintProperty() {}
  getCenter() { return this.center; } setCenter([lng, lat]: [number, number]) { this.center = { lng, lat }; }
  getZoom() { return this.zoom; } getMinZoom() { return this.min; } setMinZoom(to: number) { this.min = to; } getMaxZoom() { return 18; }
  project(point: [number, number] | { lng: number; lat: number }) { const [lng, lat] = Array.isArray(point) ? point : [point.lng, point.lat]; return { x: (lng - this.center.lng) * 1e5, y: (this.center.lat - lat) * 1e5 }; }
  jumpTo(to: { center?: [number, number]; zoom?: number }) { if (to.center) this.setCenter(to.center); if (to.zoom !== undefined) this.zoom = to.zoom; this.fire('moveend'); }
  easeTo(to: { center?: [number, number]; zoom?: number }) { this.jumpTo(to); }
  remove() {}
}
class FakeMarker {
  el: HTMLElement;
  constructor(options: { element: HTMLElement }) { this.el = options.element; }
  setLngLat() { return this; } addTo(map: FakeMap) { map.box.append(this.el); return this; } remove() { this.el.remove(); }
}
vi.mock('maplibre-gl', () => ({ default: { Map: FakeMap, Marker: FakeMarker } }));
vi.mock('@/app/c/actions', () => ({}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => { cleanup(); maps.length = 0; vi.unstubAllGlobals(); });

const NISI = { name: 'Nisi Bistro', lat: 40.76168, lon: -73.94994 }, ISLAND: [number, number] = [-73.9500, 40.7615], LIC: [number, number] = [-73.9426, 40.7540];
const seat = (taken: boolean, here = false): Seat => ({ taken, face: null, here, yours: !taken });
const group = (say: string, seats: Seat[], state: 'open' | 'near' | 'met' = 'open'): Stub => ({ kind: 'group', giver: 'Nisi Bistro', text: '$2 off every drink', need: 2, seats, say, state });
function ticket(title: string, more: Partial<Ticket> = {}): Ticket {
  return { id: title, title, day: 'Today', mapDate: '2026-11-23', mapDay: 'Today', time: '5pm', ends: 'until 7pm', when: new Date().toISOString(), source: null, by: 'Nisi Bistro', place: 'Nisi Bistro', about: null, link: null, tags: [],
    map: NISI, words: [], pull: 0, going: 0, stub: group('You would unlock it', [seat(false), seat(false)]), how: null, known: [], mine: null, action: 'in', status: null, joinToken: null,
    member: false, byFace: null, timeOpen: null, setBy: null, deal: { line: '$2 off every drink', need: 2, until: 'until 7pm' }, ...more };
}
const plain = (title: string, map: Ticket['map'] = null): Ticket => ticket(title, { by: 'Chess Club', place: 'Bloomberg Center', map, deal: null, stub: { kind: 'none', say: 'Nobody is in yet', faces: [] } });
const model = (tickets: Ticket[]): Screen => ({ campus: { slug: 'cornell-tech', name: 'Cornell Tech', tz: 'America/New_York', listSource: 'CampusGroups' }, viewer: null, tickets, earning: [], live: null, places: [], spots: [] });

/** What the browser says: whether location is already allowed, and where the person is. Counts every position read. */
function browser(state: 'granted' | 'prompt' | 'denied' | null, spot: [number, number] | null) {
  const reads = vi.fn((found: (at: { coords: { longitude: number; latitude: number } }) => void, refused: () => void) => { if (spot) found({ coords: { longitude: spot[0], latitude: spot[1] } }); else refused(); });
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: reads }, ...(state ? { permissions: { query: async () => ({ state }) } } : { permissions: undefined }) });
  return reads;
}
async function week(tickets: Ticket[]) {
  await act(async () => { render(<CampusScreen screen={model(tickets)} signInHref="/sign-in" />); });
}
const titles = () => screen.queryAllByRole('heading', { level: 3 }).map(each => each.textContent);

describe('a deal in the week list', () => {
  it('stands where the test puts it: the island is the deal place’s section, Long Island City is not', () => {
    const land = landOf('cornell-tech')!;
    expect(sectionAt(land, [NISI.lon, NISI.lat])?.id).toBe('roosevelt');
    expect(sectionAt(land, ISLAND)?.id).toBe('roosevelt');
    expect(sectionAt(land, LIC)?.id).toBe('queensbridge');
  });

  it('shows to someone whose browser already allows location and who stands in its section, leading with the deal', async () => {
    browser('granted', ISLAND);
    await week([ticket('Drinks at Nisi Bistro'), plain('Chess night')]);
    await waitFor(() => expect(titles()).toContain('Drinks at Nisi Bistro'));
    const card = screen.getByRole('heading', { name: 'Drinks at Nisi Bistro' }).closest('article')!, text = card.textContent!;
    let from = 0;
    for (const part of ['Drinks at Nisi Bistro', '$2 off every drink', 'Deal · 2+ of you', 'until 7pm', 'Nisi Bistro']) {
      const found = text.indexOf(part, from);
      expect(found, part).toBeGreaterThanOrEqual(0);
      from = found + part.length;
    }
    expect(card.querySelector('.cs-deal strong')!.textContent).toBe('$2 off every drink');
    // The place alone under the deal, and the seats without their "Group reward from" header.
    expect(card.querySelector('.cs-body > p')!.textContent).toBe('Nisi Bistro');
    expect(text).not.toContain('Group reward from');
    expect(document.body.textContent!.toLowerCase()).not.toContain('happy hour');
  });

  it('is left out, with no position read, when location is not yet allowed or refused', async () => {
    for (const state of ['prompt', 'denied', null] as const) {
      const reads = browser(state, ISLAND);
      await week([ticket('Drinks at Nisi Bistro'), plain('Chess night')]);
      await act(async () => { await new Promise(done => setTimeout(done, 10)); });
      expect(titles()).toEqual(['Chess night']);
      expect(reads).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('is left out for someone standing elsewhere on the campus', async () => {
    const reads = browser('granted', LIC);
    await week([ticket('Drinks at Nisi Bistro'), plain('Chess night')]);
    await waitFor(() => expect(reads).toHaveBeenCalled());
    expect(titles()).toEqual(['Chess night']);
  });

  it('keeps the seats and their words as they are: "0 of 2 checked in", then "Unlocked for your group"', async () => {
    browser('granted', ISLAND);
    await week([ticket('Drinks at Nisi Bistro', { stub: group('0 of 2 checked in', [seat(true), seat(true)]) })]);
    expect(await screen.findByText('Group of 2 · 0 of 2 checked in')).toBeTruthy();
    cleanup();
    browser('granted', ISLAND);
    await week([ticket('Drinks at Nisi Bistro', { stub: group('Unlocked for your group', [seat(true, true), seat(true, true)], 'met') })]);
    expect(await screen.findByText('Group of 2 · Unlocked for your group')).toBeTruthy();
  });
});

describe('a deal on Near you', () => {
  it('shows in its own section to anyone, location allowed or not', async () => {
    browser('prompt', null);
    await week([ticket('Drinks at Nisi Bistro'), plain('Chess night', { name: 'Bloomberg Center', lat: 40.7557, lon: -73.9558 })]);
    expect(titles()).toEqual(['Chess night']);
    fireEvent.click(screen.getByRole('button', { name: 'Near you' }));
    await waitFor(() => expect(maps).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Drinks at Nisi Bistro, Today 5pm' })).toBeTruthy());
  });
});
