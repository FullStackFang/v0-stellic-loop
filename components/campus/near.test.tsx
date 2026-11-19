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
  return { id: title, title, day: 'Today', mapDate: '2026-11-19', mapDay: 'Today', time, ends: null, when: at(hours), source: null, by: null, place: `${title} hall`, about: null, link: null, tags: [], map: lon === null ? null : { name: `${title} hall`, lat, lon },
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
    // The locate button says why you are not on the map, and shows it on its own mark.
    const find = screen.getByRole('button', { name: 'Back to where you are' });
    expect(find.getAttribute('data-where')).toBe('away');
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(find);
    expect(screen.getByRole('status').textContent).toMatch(/away from this campus/);
  });

  it('the locate button asks the browser again, and puts you on the map once it says you are here', async () => {
    locate(null);
    await near();
    const find = screen.getByRole('button', { name: 'Back to where you are' });
    expect(find.getAttribute('data-where')).toBe('off');
    fireEvent.click(find);
    expect(screen.getByRole('status').textContent).toMatch(/location is off/);
    locate([-76.4790, 42.4548]);
    fireEvent.click(find);
    await waitFor(() => expect(place()).toBe('North Campus'));
    expect(find.getAttribute('data-where')).toBe('here');
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('.cs-you')).toBeTruthy();
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
    // The map has the usual in and out, one step each, beside the compass.
    const before = map.getZoom();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(map.getZoom()).toBe(before + 1);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(map.getZoom()).toBe(before);
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

// A wide window: the map sits beside the week, and the list is what turns it.
describe('The map beside the week, on a wide window', () => {
  async function wide(tickets = week) {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width'), addEventListener() {}, removeEventListener() {} }));
    locate(null);
    render(<CampusScreen screen={model('cornell', tickets)} signInHref="/sign-in" />);
    await waitFor(() => expect(maps).toHaveLength(1));
    return maps[0];
  }
  const card = (title: string) => screen.getByRole('heading', { level: 3, name: title }).closest('article')!;
  const stamp = (title: string) => screen.getByRole('button', { name: `${title}, Today ${week.find(each => each.title === title)!.time}` });

  it('shows the map without a "Near you" view, names the sources still to come, and has no dial', async () => {
    await wide();
    expect(screen.queryByRole('button', { name: 'Near you' })).toBeNull();
    expect(screen.getByRole('button', { name: 'CampusGroups' })).toHaveAttribute('aria-pressed', 'false');
    const sources = screen.getByRole('group', { name: 'Where plans are listed from' });
    expect(within(sources).getByText('Luma')).toBeTruthy();
    expect(within(sources).getByText('Posh')).toBeTruthy();
    expect(within(sources).queryByRole('button', { name: /Luma|Posh/ })).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: /4 on the map/ })).toBeTruthy();
  });

  it('starts on the first plan with a spot, and a ticket pressed in the list becomes the plan that is on', async () => {
    await wide();
    await waitFor(() => expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Study group'));
    expect(card('Study group').className).toContain('sel');
    fireEvent.click(card('Dumpling night'));
    expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Dumpling night');
    expect(card('Dumpling night').className).toContain('sel');
    expect(stamp('Dumpling night')).toHaveAttribute('aria-pressed', 'true');
    // The ticket did not open: picking is not Details.
    expect(within(card('Dumpling night')).getByRole('button', { name: 'Details' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('a stamp pressed on the map picks its ticket in the list, and pressed again lets go', async () => {
    await wide();
    await waitFor(() => expect(pins()).toContain('Dumpling night, Today 8pm'));
    fireEvent.click(stamp('Dumpling night'));
    expect(card('Dumpling night').className).toContain('sel');
    expect(card('Study group').className).not.toContain('sel');
    fireEvent.click(stamp('Dumpling night'));
    expect(card('Dumpling night').className).not.toContain('sel');
    expect(document.querySelector('.cs-bub')).toBeNull();
  });

  it('a second ticket picked while the map is still travelling to the first is whole when the map comes to rest', async () => {
    const map = await wide();
    await waitFor(() => expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Study group'));
    // The real map takes time to travel. A new move ends the one in flight there and then, which says "moveend" (maplibre's
    // easeTo stops the transition underway first), and a listener set with `once` hears only the next "moveend".
    const waiting: Handler[] = [];
    let aim: { center?: [number, number]; zoom?: number } | null = null;
    const end = () => { map.fire('moveend'); for (const heard of waiting.splice(0)) heard({}); };
    map.once = (type, handler) => { if (type === 'moveend') waiting.push(handler); else handler({}); return map; };
    map.easeTo = to => {
      if (aim) end();
      aim = to;
      if (to.center) map.setCenter([(map.center.lng + to.center[0]) / 2, (map.center.lat + to.center[1]) / 2]);   // half way there
      map.fire('move');
    };
    const arrive = () => { if (aim?.center) map.setCenter(aim.center); if (aim?.zoom !== undefined) map.zoom = aim.zoom; aim = null; map.fire('move'); end(); };

    fireEvent.click(card('Dumpling night'));
    fireEvent.click(card('Study group'));   // before the map has arrived
    act(arrive);
    expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Study group');
    // "Away" is how far the view has left the ticket since it was dealt: none, the map has only just come to rest on it.
    expect(document.querySelector<HTMLElement>('.cs-near')!.style.getPropertyValue('--away')).toBe('0.000');
  });

  it('a ticket in another part of town brings the map there, and one with no spot leaves the map alone', async () => {
    await wide();
    expect(place()).toBe('Collegetown');
    fireEvent.click(card('Blitz night'));
    expect(place()).toBe('Central Campus');
    await waitFor(() => expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Blitz night'));
    fireEvent.click(card('Somewhere'));
    expect(place()).toBe('Central Campus');
    expect(document.querySelector('.cs-bub')).toBeNull();
  });

  it('the words to try sit with the search line, and searching narrows the list and the map together', async () => {
    await wide();
    fireEvent.click(within(screen.getByRole('group', { name: 'Words to try' })).getByRole('button', { name: 'study' }));
    expect(screen.getByLabelText('Say what you feel like doing')).toHaveValue('study');
    await waitFor(() => expect(pins()).toEqual(['Study group, Today 3pm']));
    expect(screen.queryByRole('heading', { level: 3, name: 'Dumpling night' })).toBeNull();
  });

  it('Details opens the ticket under itself in the list, not over the map', async () => {
    await wide();
    const ticket = card('Dumpling night');   // found before it opens: the open panel repeats the title
    fireEvent.click(within(ticket).getByRole('button', { name: 'Details' }));
    expect(within(ticket).getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('.cs-grid .cs-sheet')).toBeTruthy();
    expect(document.querySelector('.cs-near-sheet.open')).toBeNull();
    expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Dumpling night');
  });
});

describe('One day on the map', () => {
  // Collegetown: two plans today at one address, one more today across the street, and one on Saturday.
  const days = [ticket('Bagels', '9am', 1, -76.4876, 42.4393), ticket('Chess', '10am', 2, -76.4876, 42.4393), ticket('Dumpling night', '8pm', 6, -76.4852, 42.4406), ticket('Market', '8am', 50, -76.4876, 42.4393, { day: 'Sat', mapDate: '2026-11-21', mapDay: 'Sat' })];
  const onMap = () => [...document.querySelectorAll('.cs-pin')].map(pin => pin.getAttribute('aria-label'));

  it('shows the first day with anything on, and a day pressed on the band puts that day on the map', async () => {
    locate(null);
    await near(days);
    await waitFor(() => expect(onMap()).toEqual(['Bagels, Today 9am, 2 here', 'Dumpling night, Today 8pm']));
    const band = screen.getByRole('group', { name: 'Day on the map' });
    expect(within(band).getByRole('button', { name: 'Today3' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(band).getByRole('button', { name: 'Sat1' }));
    await waitFor(() => expect(onMap()).toEqual(['Market, Sat 8am']));
    expect(screen.getByRole('slider').getAttribute('aria-valuemax')).toBe('1');   // the dial turns through that day only
  });

  it('something already running is under Today, apart from a plan on the same weekday later this week', async () => {
    // An exhibition that began last Saturday and is still on, and this Saturday's market: both read "Sat" on their stamps.
    const running = [ticket('Exhibition', '10am', -120, -76.4852, 42.4406, { day: 'Sat' }), ticket('Bagels', '9am', 1, -76.4876, 42.4393), ticket('Market', '8am', 50, -76.4876, 42.4393, { day: 'Sat', mapDate: '2026-11-21', mapDay: 'Sat' })];
    locate(null);
    await near(running);
    await waitFor(() => expect(onMap()).toEqual(['Exhibition, Sat 10am', 'Bagels, Today 9am']));
    const band = screen.getByRole('group', { name: 'Day on the map' });
    expect(within(band).getAllByRole('button').map(pill => pill.textContent)).toEqual(['Today2', 'Sat1']);
    expect(within(band).getByRole('button', { name: 'Today2' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(band).getByRole('button', { name: 'Sat1' }));
    await waitFor(() => expect(onMap()).toEqual(['Market, Sat 8am']));
  });

  it('on a phone, a plan opened from another day brings its day onto the map, and the day stays when it closes', async () => {
    // The composer offers a plan already on with the tag typed, whatever its day; "Look at" opens its ticket.
    const viewer = { first: 'Ana', name: 'Ana', photo: null, face: 0, ownPhoto: null, own: null, owns: [], picks: { core: [], premium: [], school: [] }, asked: false, makesLeft: 0, level: 0, outings: 0, admin: false, groups: [] };
    const tagged = days.map(each => each.title === 'Market' ? { ...each, tags: ['market'] } : each);
    locate(null);
    render(<CampusScreen screen={{ ...model('cornell', tagged), viewer }} signInHref="/sign-in" />);
    fireEvent.click(screen.getByRole('button', { name: 'Near you' }));
    await waitFor(() => expect(onMap()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Post a plan' }));
    fireEvent.change(document.querySelector('#cs-say')!, { target: { value: 'coffee @market ' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Look at Market' }));
    await waitFor(() => expect(onMap()).toEqual(['Market, Sat 8am']));
    expect(document.querySelector('.cs-pin')?.className).toContain('sel');
    fireEvent.click(within(document.querySelector<HTMLElement>('.cs-near-sheet.open')!).getAllByRole('button', { name: /Close/ })[0]);
    await screen.findByRole('slider');
    expect(onMap()).toEqual(['Market, Sat 8am']);
  });

  it('beside the list, pointing at either plan of a shared address lifts its one stamp', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width'), addEventListener() {}, removeEventListener() {} }));
    locate(null);
    render(<CampusScreen screen={model('cornell', days)} signInHref="/sign-in" />);
    await waitFor(() => expect(maps).toHaveLength(1));
    await waitFor(() => expect(onMap()).toHaveLength(2));
    fireEvent.mouseEnter(screen.getByRole('heading', { level: 3, name: 'Chess' }).closest('article')!);
    expect(document.querySelector('.cs-pin.hov')?.getAttribute('aria-label')).toBe('Bagels, Today 9am, 2 here');
  });

  it('has no day pills when everything on the map is on one day', async () => {
    locate(null);
    await near();
    await waitFor(() => expect(pins()).toHaveLength(2));
    expect(screen.queryByRole('group', { name: 'Day on the map' })).toBeNull();
  });

  it('plans at one address share one stamp, which says how many, and "Also here" turns it to the next', async () => {
    locate(null);
    await near(days);
    await waitFor(() => expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Bagels'));
    expect(document.querySelector('.cs-pin .cs-n')?.textContent).toBe('2');
    fireEvent.click(screen.getByText('Also here: Chess, 10am ›'));
    expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Chess');
    expect(onMap()).toEqual(['Chess, Today 10am, 2 here', 'Dumpling night, Today 8pm']);
    expect(screen.getByText('Also here: Bagels, 9am ›')).toBeTruthy();
    expect(document.querySelector('.cs-near.picked')).toBeNull();   // turning the stamp does not open a ticket
  });

  it('beside the list, a ticket from another day brings its day onto the map', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width'), addEventListener() {}, removeEventListener() {} }));
    locate(null);
    render(<CampusScreen screen={model('cornell', days)} signInHref="/sign-in" />);
    await waitFor(() => expect(maps).toHaveLength(1));
    await waitFor(() => expect(onMap()).toHaveLength(2));
    fireEvent.click(screen.getByRole('heading', { level: 3, name: 'Market' }).closest('article')!);
    await waitFor(() => expect(onMap()).toEqual(['Market, Sat 8am']));
    expect(within(screen.getByRole('group', { name: 'Day on the map' })).getByRole('button', { name: 'Sat1' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Today3' }));
    await waitFor(() => expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Bagels'));
  });
});

describe('New York: the way on is a station sign', () => {
  // One plan on Roosevelt Island and one a stop west, on the Upper East Side.
  const town = [ticket('Tram ride', '3pm', 1, -73.9552, 40.7562), ticket('Museum night', '6pm', 4, -73.9665, 40.7647)];

  it('by train: the stop, its lines and what is on there, and it takes you there', async () => {
    locate(null);
    const map = await near(town, 'cornell-tech');
    expect(screen.getByRole('heading', { level: 2, name: 'Roosevelt Island' })).toBeTruthy();
    await wholeSection();
    act(() => map.drag(-.01, 0));
    const sign = await screen.findByRole('button', { name: 'Go to Upper East Side' });
    expect(sign.className).toContain('sign');
    expect(within(sign).getByText('Lexington Av/63 St')).toBeTruthy();
    expect(within(sign).getByText('Upper East Side · 1 on')).toBeTruthy();
    expect([...sign.querySelectorAll('.cs-lines i')].map(each => each.textContent)).toEqual(['F', 'M', 'Q']);
    fireEvent.click(sign);
    expect(screen.getByRole('heading', { level: 2, name: 'Upper East Side' })).toBeTruthy();
  });

  it('a stop with nothing on is a greyed sign that goes nowhere', async () => {
    locate(null);
    const map = await near(town, 'cornell-tech');
    await wholeSection();
    act(() => map.drag(.01, -.004));
    const shut = await screen.findByRole('status');
    expect(shut.className).toContain('sign');
    expect(within(shut).getByText('21 St–Queensbridge')).toBeTruthy();
    expect(within(shut).getByText('Nothing on yet. Coming soon')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Go to/ })).toBeNull();
  });

  it('Ithaca keeps its arrow', async () => {
    locate(null);
    const map = await near();
    await wholeSection();
    act(() => map.drag(0, .01));
    const way = await screen.findByRole('button', { name: 'Go to Central Campus' });
    expect(way.className).not.toContain('sign');
    expect(way.querySelector('.cs-lines')).toBeNull();
  });
});

// A plan at a known place that lies in no section: the map goes off to that place alone (public/demo/mockups-map-solo.html).
describe('A place on its own, off the map', () => {
  // The first plan of the week is at the Cornell Club in Midtown; the others are on Roosevelt Island.
  const club = ticket('Alumni mixer', '1pm', 1, -73.9793717, 40.7542822, { place: 'The Cornell Club, 6 E 44th St', map: { name: 'The Cornell Club', lat: 40.7542822, lon: -73.9793717 } });
  const town = [club, ticket('Tram ride', '3pm', 2, -73.9552, 40.7562), ticket('Market', '5pm', 4, -73.94687, 40.76489)];
  async function wide() {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width'), addEventListener() {}, removeEventListener() {} }));
    locate(null);
    render(<CampusScreen screen={model('cornell-tech', town)} signInHref="/sign-in" />);
    await waitFor(() => expect(maps).toHaveLength(1));
    return maps[0];
  }
  const card = (title: string) => screen.getByRole('heading', { level: 3, name: title }).closest('article')!;
  const sheet = () => screen.getByRole('heading', { level: 2, name: /Roosevelt Island|The Cornell Club/ }).textContent;

  it('the map starts on the campus, not on the place off it, and the card of a plan off the map says so', async () => {
    await wide();
    await waitFor(() => expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Tram ride'));
    expect(sheet()).toBe('Roosevelt Island');
    expect(pins()).toEqual(['Tram ride, Today 3pm', 'Market, Today 5pm']);
    expect(within(card('Alumni mixer')).getByText('Off the map')).toBeTruthy();
    expect(within(card('Tram ride')).getByText('On the map')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Back to Roosevelt Island/ })).toBeNull();
  });

  it('picking it shows that place alone, with the stop it is by, and one pill goes back', async () => {
    await wide();
    await waitFor(() => expect(sheet()).toBe('Roosevelt Island'));
    fireEvent.click(card('Alumni mixer'));
    expect(sheet()).toBe('The Cornell Club');
    expect(pins()).toEqual(['Alumni mixer, Today 1pm']);
    expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Alumni mixer');
    expect(document.querySelector('.cs-near-band p')?.textContent).toContain('Off the map');
    expect(document.querySelector('.cs-near-band p')?.textContent).not.toContain('sheet');
    const stop = screen.getByRole('note', { name: 'Nearest stop' });
    expect(within(stop).getByText('Grand Central–42 St')).toBeTruthy();
    expect([...stop.querySelectorAll('.cs-lines i')].map(each => each.textContent)).toEqual(['4', '5', '6', '7']);
    // Pushing the edge of this sheet leads nowhere: there is no way on.
    await wholeSection();
    act(() => maps[0].drag(.01, 0));
    expect(document.querySelector('.cs-way:not(.stop)')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Back to Roosevelt Island/ }));
    expect(sheet()).toBe('Roosevelt Island');
    expect(pins()).toEqual(['Tram ride, Today 3pm', 'Market, Today 5pm']);
    expect(card('Tram ride').className).toContain('sel');
    expect(screen.queryByRole('note', { name: 'Nearest stop' })).toBeNull();
  });

  it('picking a plan on the campus from there comes back too', async () => {
    await wide();
    fireEvent.click(card('Alumni mixer'));
    expect(sheet()).toBe('The Cornell Club');
    fireEvent.click(card('Market'));
    expect(sheet()).toBe('Roosevelt Island');
    expect(document.querySelector('.cs-bub .main > b')?.textContent).toBe('Market');
  });

  it('a place with no known stop near it has no sign', async () => {
    town[0] = ticket('Far talk', '1pm', 1, -73.99, 40.72, { map: { name: 'Somewhere downtown', lat: 40.72, lon: -73.99 } });
    await wide();
    fireEvent.click(card('Far talk'));
    expect(screen.getByRole('heading', { level: 2, name: 'Somewhere downtown' })).toBeTruthy();
    expect(screen.queryByRole('note', { name: 'Nearest stop' })).toBeNull();
    town[0] = club;
  });

  it('on a phone the dial keeps to the campus', async () => {
    locate(null);
    await near(town, 'cornell-tech');
    expect(sheet()).toBe('Roosevelt Island');
    await waitFor(() => expect(pins()).toEqual(['Tram ride, Today 3pm', 'Market, Today 5pm']));
  });
});
