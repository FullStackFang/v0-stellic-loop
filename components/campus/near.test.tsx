import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CampusScreen } from './screen';
import { pictureOf } from './near';
import type { Screen, Ticket } from '@/lib/campus/view';

// "Near you": the week on a map. The map library draws with WebGL, which a test has not got, so a stand-in keeps the
// view's centre and zoom and passes on the events the real one would. Everything else is the real screen.
type Handler = (event: { originalEvent?: unknown }) => void;
const maps: FakeMap[] = [];
class FakeMap {
  handlers: Record<string, Handler[]> = {}; center: { lng: number; lat: number }; zoom: number; min = 0; box: HTMLElement;
  touchZoomRotate = { disableRotation() {} };
  constructor(options: { container: HTMLElement; center: [number, number]; zoom: number }) { this.box = options.container; this.center = { lng: options.center[0], lat: options.center[1] }; this.zoom = options.zoom; maps.push(this); }
  on(type: string, handler: Handler) { (this.handlers[type] ??= []).push(handler); return this; }
  once(_type: string, handler: Handler) { handler({}); return this; }
  fire(type: string, event: { originalEvent?: unknown } = {}) { for (const handler of this.handlers[type] ?? []) handler(event); }
  getSource() { return { setData() {} }; } hasImage() { return false; } addImage() {}
  setPaintProperty() {}
  getCenter() { return this.center; } setCenter([lng, lat]: [number, number]) { this.center = { lng, lat }; }
  getZoom() { return this.zoom; } getMinZoom() { return this.min; } setMinZoom(to: number) { this.min = to; } getMaxZoom() { return 18; }
  project(point: [number, number] | { lng: number; lat: number }) { const [lng, lat] = Array.isArray(point) ? point : [point.lng, point.lat]; return { x: (lng - this.center.lng) * 1e5, y: (this.center.lat - lat) * 1e5 }; }
  jumpTo(to: { center?: [number, number]; zoom?: number }) { if (to.center) this.setCenter(to.center); if (to.zoom !== undefined) this.zoom = to.zoom; this.fire('moveend'); }
  easeTo(to: { center?: [number, number]; zoom?: number }) { this.jumpTo(to); }
  remove() {}
  /** A person drags the view this far east and north, in degrees. */
  drag(east: number, north: number) { this.center = { lng: this.center.lng + east, lat: this.center.lat + north }; this.fire('move', { originalEvent: {} }); }
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

const at = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();
function ticket(title: string, time: string, hours: number, lon: number | null, lat = 0, more: Partial<Ticket> = {}): Ticket {
  return { id: title, title, day: 'Today', time, ends: null, when: at(hours), source: null, by: null, place: `${title} hall`, about: null, link: null, tag: null, map: lon === null ? null : { name: `${title} hall`, lat, lon },
    words: [], pull: 0, going: 0, stub: { kind: 'none', say: 'Nobody is in yet', faces: [] }, how: null, known: [], mine: null, action: 'in', status: null, joinToken: null, ...more };
}
// Two in Collegetown, one in Central Campus, one in North Campus (two steps from Collegetown), and one with no spot.
const week = [ticket('Study group', '3pm', 1, -76.4876, 42.4393, { words: ['study'] }), ticket('Dumpling night', '8pm', 6, -76.4852, 42.4406), ticket('Blitz night', '7pm', 5, -76.4857, 42.4466),
  ticket('Volleyball', '6pm', 4, -76.4772, 42.4531), ticket('Somewhere', '1pm', 3, null)];
const model = (slug: string, tickets: Ticket[]): Screen => ({ campus: { slug, name: slug, tz: 'America/New_York', listSource: 'CampusGroups' }, viewer: null, tickets, earning: [], live: null, places: [] });
/** Where the browser says the person is: a spot, or nothing when it will not say. */
function locate(spot: [number, number] | null) {
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: (found: (at: { coords: { longitude: number; latitude: number } }) => void, refused: () => void) => { if (spot) found({ coords: { longitude: spot[0], latitude: spot[1] } }); else refused(); } } });
}
async function near(tickets = week, slug = 'cornell') {
  render(<CampusScreen screen={model(slug, tickets)} signInHref="/sign-in" />);
  fireEvent.click(screen.getByRole('button', { name: 'Near you' }));
  await waitFor(() => expect(maps).toHaveLength(1));
  return maps[0];
}
/** A person pinches out until the whole section is in view: as far out as the map lets them go. */
async function wholeSection() {
  const map = maps[0];
  await waitFor(() => expect(map.getMinZoom()).toBeGreaterThan(0));   // the view has been framed
  act(() => { map.zoom = map.getMinZoom(); map.fire('move', { originalEvent: {} }); map.fire('moveend'); });
}
const place = () => screen.getByRole('heading', { level: 2, name: /Collegetown|Central Campus|North Campus|Downtown|West Campus|Ag Quad/ }).textContent;
const pins = () => screen.queryAllByRole('button', { name: /, Today / }).map(pin => pin.getAttribute('aria-label'));

describe('Near you', () => {
  it('is a view only for a campus whose sections are drawn', () => {
    render(<CampusScreen screen={model('columbia', week)} signInHref="/sign-in" />);
    expect(screen.queryByRole('button', { name: 'Near you' })).toBeNull();
    cleanup();
    render(<CampusScreen screen={model('cornell', week)} signInHref="/sign-in" />);
    expect(screen.getByRole('button', { name: 'Near you' })).toBeTruthy();
  });

  it('with no location, starts where the most is on, pins what is on there, and says how much of the week has a spot', async () => {
    locate(null);
    await near();
    expect(place()).toBe('Collegetown');
    expect(screen.getByText('Your location is off')).toBeTruthy();
    await waitFor(() => expect(pins()).toEqual(['Study group, Today 3pm', 'Dumpling night, Today 8pm']));
    expect(screen.getByRole('heading', { name: '4 of 5 this week are on the map' })).toBeTruthy();
  });

  it('starts in the section you stand in when the browser says where you are, and says "away" when that is off the map', async () => {
    locate([-76.4790, 42.4548]);
    await near();
    await waitFor(() => expect(place()).toBe('North Campus'));
    expect(screen.getByText('You are here')).toBeTruthy();
    cleanup(); maps.length = 0;
    locate([-73.9857, 40.7484]);
    await near();
    expect(place()).toBe('Collegetown');
    expect(screen.getByText('You are away from campus')).toBeTruthy();
  });

  it('the dial turns through the section in order of time, and the plan that is on hands over its ticket', async () => {
    locate(null);
    await near();
    const dial = await screen.findByRole('slider', { name: 'What is on, in order of time' });
    expect(dial.getAttribute('aria-valuetext')).toBe('Study group, Today 3pm');
    await waitFor(() => expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Study group'));
    fireEvent.keyDown(dial, { key: 'ArrowRight' });
    expect(dial.getAttribute('aria-valuetext')).toBe('Dumpling night, Today 8pm');
    expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Dumpling night');
  });

  it('opens the ticket of the time that is on, and lets go of it', async () => {
    locate(null);
    await near();
    fireEvent.keyDown(await screen.findByRole('slider'), { key: 'Enter' });
    const open = document.querySelector<HTMLElement>('.cs-near-sheet.open')!;
    expect(within(open).getAllByText('Study group').length).toBeGreaterThan(0);
    expect(within(open).getByText("I'm in")).toBeTruthy();
    expect(screen.queryByRole('slider')).toBeNull();
    fireEvent.click(within(open).getAllByRole('button', { name: /Close/ })[0]);
    expect(await screen.findByRole('slider')).toBeTruthy();
  });

  it('the wall holds the view inside the section, and a push against it shows the way on', async () => {
    locate(null);
    const map = await near();
    await wholeSection();   // the whole section in view: it cannot move at all
    const before = map.getCenter();
    act(() => map.drag(0, .01));
    expect(map.getCenter()).toEqual(before);
    fireEvent.click(await screen.findByRole('button', { name: 'Go to Central Campus' }));
    expect(place()).toBe('Central Campus');
    await waitFor(() => expect(pins()).toEqual(['Blitz night, Today 7pm']));
    expect(screen.getByText('1 step from the start')).toBeTruthy();
  });

  it('a way that is not open yet goes nowhere: too far from where you stand, nothing on, or nothing that way', async () => {
    locate(null);
    const map = await near();
    await wholeSection();
    act(() => map.drag(.01, 0));
    expect(within(await screen.findByRole('status')).getByText('Nothing this way yet')).toBeTruthy();
    act(() => map.drag(-.01, 0));
    expect(within(await screen.findByRole('status')).getByText('Nothing on yet. Coming soon')).toBeTruthy();   // Downtown has nothing on
    expect(screen.queryByRole('button', { name: /^Go to/ })).toBeNull();
    act(() => map.drag(0, .01));
    fireEvent.click(await screen.findByRole('button', { name: 'Go to Central Campus' }));
    await wholeSection();
    act(() => map.drag(.004, .01));
    const shut = await screen.findByRole('status');
    expect(within(shut).getByText('North Campus')).toBeTruthy();
    expect(within(shut).getByText('Not open from here yet')).toBeTruthy();
    expect(place()).toBe('Central Campus');
  });

  it('a stamp carries a picture guessed from the plan, and the ticket says how far the walk is once the browser says where you are', async () => {
    expect(pictureOf({ title: 'Dumpling night', words: [] })).toBe('bowl');
    expect(pictureOf({ title: 'Prelim review', words: ['study'] })).toBe('study');
    expect(pictureOf({ title: 'Something else', words: [] })).toBe('spark');
    locate(null);
    await near();
    await waitFor(() => expect(document.querySelector('.cs-bub')).toBeTruthy());
    expect(document.querySelector('.cs-bub .stub')).toBeNull();
    cleanup(); maps.length = 0;
    locate([-76.4870, 42.4390]);
    await near();
    await waitFor(() => expect(document.querySelector('.cs-bub .stub')?.textContent).toMatch(/^[0-9]+minwalk$/));
    expect(document.querySelector('.cs-you')?.textContent).toContain('YOU');
  });

  it('the compass is the one button on the map, and it brings you back to where you stand', async () => {
    locate(null);
    const map = await near();
    await wholeSection();
    act(() => map.drag(0, .01));
    fireEvent.click(await screen.findByRole('button', { name: 'Go to Central Campus' }));
    expect(place()).toBe('Central Campus');
    expect(screen.queryByRole('button', { name: /Zoom/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to where you are' }));
    expect(place()).toBe('Collegetown');
  });
  it('searches the map with the page\'s own search line', async () => {
    locate(null);
    await near();
    fireEvent.change(screen.getByLabelText('Say what you feel like doing'), { target: { value: 'study' } });
    await waitFor(() => expect(pins()).toEqual(['Study group, Today 3pm']));
    expect(screen.getByRole('heading', { name: '1 on the map for “study”' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Say what you feel like doing'), { target: { value: 'opera' } });
    expect(await screen.findByText('Nothing in Collegetown for “opera”')).toBeTruthy();
  });
});
