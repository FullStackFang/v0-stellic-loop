'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { GeoJSONSource, Map as GlMap, MapLibreEvent, MapMouseEvent, Marker, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { bounds, held, hops, inside, middle, sectionAt, walkMinutes, wayOn, WALK_PER_MINUTE, type Point, type Section, type Way } from '@/lib/campus/sections';
import type { Face, Ticket } from '@/lib/campus/view';
import { FaceDot } from './screen';
import { Swap, visiting, type SwapCampus } from './swap';

// "Near you": the week on a map, one section of town at a time. The look is public/demo/mockups-map-print.html: a
// two-ink poster on paper. The ink colour draws the sheet, the school's colour is the second ink printed a little off
// register, and one hot ink is kept for plans and nothing else, so a plan is the loudest thing on the page.
// The map is the list: each plan is a stamp, the dial under the map turns through them in order of time, and the one
// that is on hands you its ticket. The view cannot leave the section (lib/campus/sections.ts, "The wall"). Pushing
// against the wall shows the way on at that edge. Streets are OpenStreetMap data drawn by MapLibre GL from OpenFreeMap
// tiles, which need no key. The map library is loaded only when this view is opened.

const CLOSE = 17.2;   // as close as the view goes by itself
const DIAL = 110;     // the height of the sheet while it holds the dial
const REST: Point = [2.5, 2.5];   // how far off register the second ink sits, in pixels
type Spot = { ticket: Ticket; at: Point; sec: string };
type Where = 'wait' | 'here' | 'away' | 'off';
type Wall = Way & { at: Point; view: string };
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const count = (spots: readonly Spot[]) => spots.reduce<Record<string, number>>((sum, spot) => ({ ...sum, [spot.sec]: (sum[spot.sec] ?? 0) + 1 }), {});
const Arrow = () => <i className="go"><svg viewBox="-8 -8 16 16" aria-hidden="true"><path d="M-6 0H6M1 -5l5 5-5 5" /></svg></i>;
/** Runs `step` from 0 to 1, easing out. Returns the way to stop it. */
function tween(ms: number, step: (t: number) => void) {
  if (calm() || typeof requestAnimationFrame !== 'function') { step(1); return () => {}; }
  let frame = 0;
  const from = performance.now(), tick = (now: number) => { const t = Math.max(0, Math.min(1, (now - from) / ms)); step(1 - (1 - t) ** 4); if (t < 1) frame = requestAnimationFrame(tick); };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

// The picture engraved on a stamp. It is guessed from the plan's own words; a plan that matches nothing gets the spark.
const ICONS: Record<string, ReactNode> = {
  hike: <><path d="M2.5 20 9 9l3.6 5.6L15 11l6.5 9z" /><path d="m7 12.4 2 1.6 1.6-1.4" /><circle cx={18} cy={5.5} r={2.3} /></>,
  food: <><circle cx={12} cy={12} r={8.6} /><circle cx={12} cy={12} r={2.8} /><path d="m6.8 8.6 1 .8M16 6.6l.6 1.1M17.4 13.6l1.2.3M8 16.4l.9-.9M13 17.6l.2 1.2" /></>,
  bowl: <><path d="M2.5 15.5a9.5 7 0 0 1 19 0z" /><path d="m7.6 10.5.9 2.4M12 9.2v2.9M16.4 10.5l-.9 2.4M2.5 15.5c.6 2.8 2.4 4.500 4.800 4.500h9.400c2.400 0 4.200-1.700 4.800-4.500M9 3c1 1-.8 1.800.2 3M14 3c1 1-.8 1.800.2 3" /></>,
  study: <><path d="M3.5 5.6c3-1.1 5.800-.8 8.500 1 2.700-1.800 5.500-2.100 8.500-1v12.600c-3-1.100-5.800-.8-8.500 1-2.700-1.800-5.500-2.100-8.500-1z" /><path d="M12 6.600v12.600M6.300 9.200c1.200-.2 2.300 0 3.300.5M6.300 12.400c1.200-.2 2.300 0 3.300.5" /></>,
  disc: <><ellipse cx={12.5} cy={14} rx={9} ry={4.3} /><ellipse cx={12.5} cy={13.3} rx={4.8} ry={1.9} /><path d="M3 6.500h5.500M5.500 3.500H12M2.500 9.500h3" /></>,
  note: <><path d="M9 17.500V5.500l10-2v12" /><ellipse cx={6.5} cy={17.5} rx={2.6} ry={2.1} /><ellipse cx={16.5} cy={15.5} rx={2.6} ry={2.1} /></>,
  spark: <path d="M12 2.800 14 10l7.200 2-7.200 2-2 7.200-2-7.200-7.200-2L10 10z" /> };
const KINDS: [string, RegExp][] = [
  ['hike', /\b(hik\w*|walk\w*|run\w*|jog\w*|trail|gorge|sunrise|sunset|outdoors?|climb\w*)\b/], ['bowl', /\b(dumplings?|noodles?|ramen|pho|soup|dinner|supper|hot ?pot|potluck)\b/],
  ['food', /\b(bagels?|lunch|brunch|breakfast|coffee|pizza|eat\w*|food|snacks?|donuts?|bak\w*|boba|tea)\b/], ['study', /\b(study\w*|class|exam\w*|prelim\w*|homework|library|read\w*|books?|review|office hours|cs ?\d+)\b/],
  ['disc', /\b(frisbee|soccer|basketball|volleyball|tennis|football|game|gym|yoga|sports?|pickup|swim\w*|skat\w*|exercise)\b/], ['note', /\b(music|concert|show|band|jam|karaoke|danc\w*|movie|film|open mic)\b/]];
export const pictureOf = (ticket: Pick<Ticket, 'title' | 'words'>) => { const said = `${ticket.title} ${ticket.words.join(' ')}`.toLowerCase(); return KINDS.find(([, like]) => like.test(said))?.[0] ?? 'spark'; };
const BURST = `${Array.from({ length: 28 }, (_, k) => { const a = k * Math.PI / 14, r = k % 2 ? 36 : 52; return `${k ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`; }).join('')}z`;
/** The postmark that lands on the stamp you pick: the section round the rim, the hour in the middle. */
const Postmark = ({ town, time, day }: { town: string; time: string; day: string }) => <svg className="cs-mark" viewBox="-31 -31 62 62" aria-hidden="true">
  <circle r={29} /><circle r={16.5} />
  <text><textPath href="#cs-arc-over" startOffset="50%" textAnchor="middle" textLength={Math.min(58, town.length * 6.2)} lengthAdjust="spacingAndGlyphs">{town.toUpperCase()}</textPath></text>
  <text><textPath href="#cs-arc-under" startOffset="50%" textAnchor="middle" dominantBaseline="hanging">LOOP</textPath></text>
  <text className="day" textAnchor="middle" y={-1}>{time.toUpperCase()}</text><text textAnchor="middle" y={8}>{day.toUpperCase()}</text></svg>;

/** MapLibre reads RGB only. The two inks are the page's own colours, so a school's colours reprint the map; the paper is always paper. */
function paints(host: HTMLElement) {
  const probe = host.appendChild(document.createElement('i')), ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgb = (css: string) => {
    probe.style.color = css;
    if (!ctx) return 'rgb(128,128,128)';
    ctx.fillStyle = getComputedStyle(probe).color; ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r},${g},${b})`;
  };
  const out = { ink: rgb('var(--cs-ink)'), second: rgb('color-mix(in oklab, var(--cs-field) 60%, var(--cs-field-shadow))'), paper: '#f0e8d4', road: '#fbf7ec', roof: '#f5eedc', water: '#3f86de' };
  probe.remove();
  return out;
}
/** The small repeating swatches the print fills parks and water with: a halftone of the second ink, and blue waves. */
function swatches(c: ReturnType<typeof paints>) {
  const make = (size: number, draw: (pen: CanvasRenderingContext2D) => void) => {
    const k = 3, sheet = document.createElement('canvas'); sheet.width = sheet.height = size * k;
    const pen = sheet.getContext('2d');
    if (!pen) return null;
    pen.scale(k, k); draw(pen);
    const made = pen.getImageData(0, 0, size * k, size * k);
    return { width: made.width, height: made.height, data: made.data };
  };
  return { dots: make(8, pen => { pen.fillStyle = c.second; for (const [x, y] of [[2, 2], [6, 6]]) { pen.beginPath(); pen.arc(x, y, 1.55, 0, 7); pen.fill(); } }),
    waves: make(12, pen => { pen.strokeStyle = c.water; pen.lineWidth = 1.2; for (const y of [3, 9]) { pen.beginPath(); pen.moveTo(-1, y); pen.bezierCurveTo(2, y - 2.2, 4, y - 2.2, 6, y); pen.bezierCurveTo(8, y + 2.2, 10, y + 2.2, 13, y); pen.stroke(); } }) };
}

const line = (coordinates: Point[], properties: object = {}) => ({ type: 'Feature' as const, properties, geometry: { type: 'LineString' as const, coordinates } });
const shape = (ring: readonly Point[]) => [...ring, ring[0]];
/** The section's edge, always walked the same way round so the second ink prints on its outside. */
const plate = (here: Section) => { const turn = here.ring.reduce((sum, a, at) => { const b = here.ring[(at + 1) % here.ring.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0);
  return line(shape(turn < 0 ? [...here.ring].reverse() : here.ring)); };
/** Everything but the section on screen: a wide square with the section cut out of it. */
const veil = (here: Section) => { const [x, y] = middle(here.ring);
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [[[x - .4, y - .35], [x + .4, y - .35], [x + .4, y + .35], [x - .4, y + .35], [x - .4, y - .35]], shape(here.ring)] } }; };
/** Like a real map sheet, each edge shared with a section next door names it. `side` says which side of the words is outside. */
function margins(land: readonly Section[], here: Section) {
  const n = here.ring.length, features = here.next.flatMap(id => {
    const other = land.find(each => each.id === id);
    if (!other) return [];
    const shared = here.ring.map(p => other.ring.some(q => q[0] === p[0] && q[1] === p[1])), first = Math.max(0, shared.findIndex((yes, at) => yes && !shared[(at - 1 + n) % n]));
    const run: Point[] = [];
    for (let k = 0; k < n && shared[(first + k) % n]; k++) run.push(here.ring[(first + k) % n]);
    if (run.length < 2) return [];
    // Words read left to right, or bottom to top on an upright edge.
    const a = run[0], b = run[run.length - 1];
    if (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? b[0] < a[0] : b[1] < a[1]) run.reverse();
    // The words sit once on the longest straight stretch of the shared edge, turned to lie along it.
    const k = Math.cos(run[0][1] * Math.PI / 180), [from, to] = run.slice(1).map((p, at): [Point, Point] => [run[at], p]).sort((a, b) => Math.hypot((b[1][0] - b[0][0]) * k, b[1][1] - b[0][1]) - Math.hypot((a[1][0] - a[0][0]) * k, a[1][1] - a[0][1]))[0];
    const east = (to[0] - from[0]) * k, north = to[1] - from[1], along = Math.hypot(east, north) || 1, at: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const above: Point = [at[0] - north / along * 2e-4 / k, at[1] + east / along * 2e-4];
    return [{ type: 'Feature' as const, properties: { name: `${other.name} this way`, side: inside(above, here.ring) ? 'under' : 'over', turn: -Math.atan2(north, east) * 180 / Math.PI }, geometry: { type: 'Point' as const, coordinates: at } }];
  });
  return { type: 'FeatureCollection' as const, features };
}
/** A straight dotted line from you to the plan that is on: which way and how far, not the route. `t` is how much of it is drawn. */
const walkLine = (from: Point | null, to: Point | null, t = 1) => ({ type: 'FeatureCollection' as const, features: from && to ? [line([from, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]])] : [] });
const walkLabel = (from: Point | null, to: Point | null) => ({ type: 'FeatureCollection' as const, features: from && to ? [{ type: 'Feature' as const, properties: { name: `${walkMinutes(from, to)} min` }, geometry: { type: 'Point' as const, coordinates: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2] } }] : [] });

function style(c: ReturnType<typeof paints>, land: readonly Section[], here: Section): StyleSpecification {
  const MINOR = ['minor'], MAJOR = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
  const wide = (px: number) => ['interpolate', ['exponential', 2], ['zoom'], 13, px / 8, 16, px, 19, px * 8];
  // Only one zoom curve may sit in an expression, so the road's class is chosen inside each stop.
  const wide2 = (minor: number, major: number) => ['interpolate', ['exponential', 2], ['zoom'], 13, ['match', ['get', 'class'], MINOR, minor / 8, major / 8], 16, ['match', ['get', 'class'], MINOR, minor, major], 19, ['match', ['get', 'class'], MINOR, minor * 8, major * 8]];
  const omt = (id: string, type: string, layer: string, paint: object, more: object = {}) => ({ id, type, source: 'omt', 'source-layer': layer, paint, ...more });
  const road = (id: string, classes: string[], paint: object, more: object = {}) => omt(id, 'line', 'transportation', paint,
    { filter: ['all', ['==', ['geometry-type'], 'LineString'], ['match', ['get', 'class'], classes, true, false]], layout: { 'line-cap': 'round', 'line-join': 'round' }, ...more });
  const geo = (data: object) => ({ type: 'geojson', data });
  const type = (size: number, space: number, more: object = {}) => ({ 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': size, 'text-transform': 'uppercase', 'text-letter-spacing': space, ...more });
  const inked = (halo = 1.6) => ({ 'text-color': c.ink, 'text-halo-color': c.paper, 'text-halo-width': halo });
  const margin = (side: string, lift: number) => ({ id: `margin-${side}`, type: 'symbol', source: 'margins', filter: ['==', ['get', 'side'], side], paint: inked(2), layout: type(9.5, .22, { 'text-rotate': ['get', 'turn'], 'text-rotation-alignment': 'map', 'text-offset': [0, lift], 'text-max-width': 40, 'text-allow-overlap': true }) });
  return { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' }, veil: geo(veil(here)), plate: geo(plate(here)), margins: geo(margins(land, here)), walk: geo(walkLine(null, null)), mins: geo(walkLabel(null, null)) },
    layers: [{ id: 'ground', type: 'background', paint: { 'background-color': c.paper } },
      omt('green', 'fill', 'landcover', { 'fill-pattern': 'dots' }), omt('park', 'fill', 'park', { 'fill-pattern': 'dots' }), omt('park-edge', 'line', 'park', { 'line-color': c.ink, 'line-width': .8, 'line-dasharray': [1, 3], 'line-opacity': .6 }),
      omt('water', 'fill', 'water', { 'fill-pattern': 'waves' }), omt('water-edge', 'line', 'water', { 'line-color': c.water, 'line-width': 1.5 }), omt('stream', 'line', 'waterway', { 'line-color': c.water, 'line-width': wide(4) }),
      road('path', ['path', 'track'], { 'line-color': c.ink, 'line-width': .9, 'line-dasharray': [2, 3], 'line-opacity': .7 }, { minzoom: 16 }),
      road('edge', [...MINOR, ...MAJOR], { 'line-color': c.ink, 'line-width': ['match', ['get', 'class'], MINOR, .9, 1.4], 'line-opacity': .75, 'line-gap-width': wide2(8, 14) }),
      road('minor', MINOR, { 'line-color': c.road, 'line-width': wide(8) }), road('major', MAJOR, { 'line-color': c.road, 'line-width': wide(14) }),
      road('centre', MAJOR, { 'line-color': c.ink, 'line-width': .8, 'line-dasharray': [5, 5], 'line-opacity': .35 }, { minzoom: 16.5 }),
      // The second ink, printed a little off register under every building.
      omt('off', 'fill', 'building', { 'fill-color': c.second, 'fill-opacity': .75, 'fill-translate': REST, 'fill-translate-anchor': 'viewport' }),
      omt('roofs', 'fill', 'building', { 'fill-color': c.roof }), omt('roof-line', 'line', 'building', { 'line-color': c.ink, 'line-width': 1, 'line-opacity': .6 }, { layout: { 'line-join': 'miter' } }),
      omt('streets', 'symbol', 'transportation_name', inked(), { minzoom: 15, filter: ['match', ['get', 'class'], ['path', 'track', 'service'], false, true], layout: type(10, .14, { 'symbol-placement': 'line', 'symbol-spacing': 340 }) }),
      omt('places', 'symbol', 'poi', inked(), { minzoom: 16, filter: ['all', ['<=', ['get', 'rank'], 4], ['match', ['get', 'class'], ['bus', 'railway'], false, true]], layout: type(9.5, .1, { 'text-max-width': 7, 'text-padding': 18 }) }),
      { id: 'walk', type: 'line', source: 'walk', layout: { 'line-cap': 'round' }, paint: { 'line-color': c.ink, 'line-width': 3.6, 'line-dasharray': [.01, 2.1] } },
      { id: 'veil', type: 'fill', source: 'veil', paint: { 'fill-color': c.paper, 'fill-opacity': .84 } },
      { id: 'rim-second', type: 'line', source: 'plate', paint: { 'line-color': c.second, 'line-width': 6, 'line-offset': 5 } },
      { id: 'rim', type: 'line', source: 'plate', layout: { 'line-join': 'miter' }, paint: { 'line-color': c.ink, 'line-width': 2.2 } },
      { id: 'rim-fine', type: 'line', source: 'plate', layout: { 'line-join': 'miter' }, paint: { 'line-color': c.ink, 'line-width': .8, 'line-offset': -4.5 } },
      margin('over', -1.5), margin('under', 1.5),
      { id: 'mins', type: 'symbol', source: 'mins', paint: inked(2.2), layout: type(10.5, .1, { 'text-field': ['get', 'name'], 'text-allow-overlap': true, 'text-offset': [0, -1] }) }] } as unknown as StyleSpecification;
}

export type NearProps = {
  land: Section[];
  /** The campuses of this school, when it has more than one: the tag in the corner of the band swaps between them. */
  swap?: SwapCampus[];
  /** The week's events that the search line has not ruled out. Those with no spot on the map are left out here. */
  tickets: Ticket[];
  /** The viewer's own face, for the spot they stand on. */
  me: Face | null;
  /** What was typed in the search line, for saying that nothing here matches it. */
  asked: string;
  /** The event whose ticket is open, and the way to open or close one. */
  picked: string | null; onPick: (id: string | null) => void;
  /** The open ticket. It takes the place of the dial. */
  children?: ReactNode;
  /** On a wide screen the map sits beside the list of tickets. The list is then the control: there is no dial and no ticket
   *  opens over the map. `picked` is the plan that is on, and it hands over its ticket on the map as the dial's plan does. */
  beside?: boolean;
  /** The plan the pointer is over in the list, and the way to say which stamp the pointer is over. */
  hot?: string | null; onHover?: (id: string | null) => void;
  /** Told where the person stands once the browser says, so the list can say how far each plan is. */
  onYou?: (at: Point | null) => void;
};

export function Near({ land, tickets, me, asked, picked, onPick, children, beside = false, hot = null, onHover, onYou, swap = [] }: NearProps) {
  const spots = useMemo(() => tickets.flatMap((ticket): Spot[] => {
    if (!ticket.map) return [];
    const at: Point = [ticket.map.lon, ticket.map.lat], sec = sectionAt(land, at);
    return sec ? [{ ticket, at, sec: sec.id }] : [];
  }).sort((a, b) => a.ticket.when.localeCompare(b.ticket.when)), [tickets, land]);
  const on = useMemo(() => count(spots), [spots]);

  // Until the browser says where you are, you stand where the most is on.
  const [standing, setStanding] = useState(() => { const first = count(spots); return [...land].sort((a, b) => (first[b.id] ?? 0) - (first[a.id] ?? 0))[0].id; });
  const [you, setYou] = useState<Point | null>(null), [where, setWhere] = useState<Where>(() => typeof navigator !== 'undefined' && navigator.geolocation ? 'wait' : 'off');
  const [view, setView] = useState(standing), [litId, setLitId] = useState<string | null>(null);
  const [map, setMap] = useState<GlMap | null>(null);
  const [wall, setWall] = useState<Pick<Wall, 'id' | 'kind' | 'view'> | null>(null);

  const here = land.find(each => each.id === view)!, list = useMemo(() => spots.filter(spot => spot.sec === view), [spots, view]);
  // Beside the list, the plan that is on is the one the list picked, and no ticket is ever open over the map (`up`).
  const at = Math.max(0, list.findIndex(spot => spot.ticket.id === litId)), lit = beside ? list.find(spot => spot.ticket.id === picked) ?? null : list[at] ?? null;
  const up = beside ? null : picked, open = up ? spots.find(spot => spot.ticket.id === up) ?? null : null;
  // A plan picked in the list that is in another section brings the map to that section.
  const [seen, setSeen] = useState(picked);
  if (picked !== seen) { setSeen(picked); const to = beside && picked ? spots.find(spot => spot.ticket.id === picked)?.sec : null; if (to && to !== view) setView(to); }
  // What the map hangs each stamp on. The map places these; the page draws the stamps inside them.
  const pins = useMemo(() => typeof document === 'undefined' ? [] : list.map(spot => ({ id: spot.ticket.id, at: spot.at, el: document.createElement('div') })), [list]);
  const youEl = useMemo(() => you && view === standing && typeof document !== 'undefined' ? document.createElement('div') : null, [you, view, standing]);

  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLDivElement>(null), band = useRef<HTMLDivElement>(null), sheet = useRef<HTMLDivElement>(null), way = useRef<HTMLElement>(null), rule = useRef<HTMLDivElement>(null);
  const lib = useRef<{ Marker: typeof Marker } | null>(null), wallAt = useRef<Wall | null>(null), marks = useRef<{ el: HTMLElement; at: Point }[]>([]), framed = useRef(false);
  // Where the view was when the ticket was dealt, and how far off register the second ink is right now.
  const home = useRef<{ zoom: number; x: number; y: number } | null>(null), ink = useRef({ rest: REST, hand: [0, 0] as Point });
  // What the map's own handlers read: they are set up once and must see the screen as it is now.
  const now = { land, here, standing, you, lit, open, on, picked, onPick, low: beside ? 0 : DIAL };
  const live = useRef(now);
  useLayoutEffect(() => { live.current = now; });

  /** Where the view should be. `floor` is the whole section in view: as far out as it goes. */
  const cam = useCallback(() => {
    const s = live.current, box = bounds(s.here.ring), k = Math.cos(box.centre[1] * Math.PI / 180);
    const w = host.current?.clientWidth ?? 400, h = host.current?.clientHeight ?? 600, top = band.current?.offsetHeight ?? 0, low = sheet.current?.offsetHeight ?? s.low;
    const zoomFor = (mpp: number) => Math.log2(40075016.686 * k / (512 * mpp));
    const floor = zoomFor(Math.max((box.east - box.west) * 111320 * k / Math.max(160, w - 36), (box.north - box.south) * 110540 / Math.max(160, h - top - s.low - 110))) - .1;
    // It starts as close as it can: you and the plan that is on just fit, and the map travels as the dial turns.
    // Next door, or with no spot of your own, it sits on the plan alone. With nothing on it shows the whole section.
    const home = s.here.id === s.standing;
    let center: Point = s.lit ? s.lit.at : home ? s.you ?? s.here.rest : box.centre, zoom = s.lit ? CLOSE - .7 : -Infinity;   // nothing on: the whole section, there is nothing to stand close to
    if (s.lit && home && s.you) {
      const a = s.you, b = s.lit.at, mpp = Math.max(Math.abs(a[0] - b[0]) * 111320 * k / Math.max(160, w - 190), Math.abs(a[1] - b[1]) * 110540 / Math.max(160, h - top - s.low - 230), 1e-9);
      center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; zoom = Math.min(CLOSE - .7, zoomFor(mpp));
    }
    zoom = Math.max(floor, zoom);
    if (!s.open) center = held(box, floor, center, zoom);
    return { center, zoom, floor, box, pitch: 0, bearing: 0, padding: { top: top + (s.open ? 0 : 50), bottom: low, left: 0, right: 0 } };
  }, []);

  /** Stamps near the right edge turn to face inward, and the way on sits where the push leaves the view. */
  const place = useCallback((map: GlMap) => {
    const w = host.current?.clientWidth ?? 0, h = host.current?.clientHeight ?? 0, top = band.current?.offsetHeight ?? 0, low = h - (sheet.current?.offsetHeight ?? live.current.low);
    for (const mark of marks.current) mark.el.classList.toggle('far', map.project(mark.at).x > w - 96);
    const el = way.current, pushed = wallAt.current;
    if (!el || !pushed) return;
    const c = map.getCenter(), from = map.project(c), to = map.project([c.lng + pushed.toward[0] * .002 / Math.cos(c.lat * Math.PI / 180), c.lat + pushed.toward[1] * .002]);
    const dx = to.x - from.x, dy = to.y - from.y, mx = w / 2, my = (top + low - 60) / 2, ew = el.offsetWidth, eh = el.offsetHeight;
    const reach = Math.min((mx - 12 - ew / 2) / (Math.abs(dx) || 1e-6), ((low - 60 - top) / 2 - 12 - eh / 2) / (Math.abs(dy) || 1e-6));
    el.style.setProperty('--a', `${Math.atan2(dy, dx)}rad`);
    el.style.flexDirection = dx < -Math.abs(dy) ? 'row-reverse' : '';   // pointing left, the arrow leads
    el.style.transform = `translate(${Math.round(mx + dx * reach - ew / 2)}px, ${Math.round(my + dy * reach - eh / 2)}px)`;
  }, []);

  /** The stamps and the ticket belong to the sheet. Pull back and they shrink with it, though less than the ground does;
   *  wander off to look at other plans and the ticket lets go, shrinking and fading the further you zoom or drag from where it was dealt.
   *  The scale bar measures in minutes of walking. */
  const tune = useCallback((map: GlMap) => {
    const el = host.current, zoom = map.getZoom(), s = live.current;
    if (!el) return;
    const by = (rate: number, least: number) => Math.max(least, Math.min(1, 2 ** ((zoom - 16.2) * rate))).toFixed(3);
    el.style.setProperty('--ticket', by(.8, .62)); el.style.setProperty('--stamp', by(.45, .68));
    const from = home.current, to = from && s.lit ? map.project(s.lit.at) : null;
    el.style.setProperty('--away', (from && to ? Math.max(0, Math.min(1, Math.max((from.zoom - zoom) / .7, (Math.hypot(to.x - from.x, to.y - from.y) - 30) / 150))) : 0).toFixed(3));
    const bar = rule.current, mpp = 40075016.686 * Math.cos(map.getCenter().lat * Math.PI / 180) / (512 * 2 ** zoom), two = 2 * WALK_PER_MINUTE / mpp, mins = two > 170 ? 1 : two < 45 ? 5 : 2;
    if (bar) { bar.style.setProperty('--w', `${Math.round(two * mins / 2)}px`); bar.dataset.mins = `${mins} min walk`; }
  }, []);

  /** The ticket takes whichever corner of its stamp covers the fewest other stamps, and stays on the map. */
  const seat = useCallback(() => {
    const bub = host.current?.querySelector<HTMLElement>('.cs-bub'), frame = host.current?.getBoundingClientRect();
    if (!bub || !frame) return;
    const rect = (el: Element) => { const r = el.getBoundingClientRect(); return [r.left - frame.left, r.top - frame.top, r.right - frame.left, r.bottom - frame.top]; };
    const pin = rect(bub.parentElement!), w = bub.offsetWidth, h = bub.offsetHeight, top = band.current?.offsetHeight ?? 0, low = frame.height - (sheet.current?.offsetHeight ?? live.current.low);
    const others = [...host.current!.querySelectorAll('.cs-pin, .cs-you, .cs-way, .cs-zoom, .cs-scale')].filter(el => el !== bub.parentElement).map(rect);
    const hits = (x: number, y: number) => others.filter(o => x < o[2] && o[0] < x + w && y < o[3] && o[1] < y + h).length + (x < 4 || x + w > frame.width - 4 || y < top + 4 || y + h > low - 4 ? 100 : 0);
    const corners: [string, number, number][] = [['', pin[0], pin[1] - 24 - h], ['r', pin[2] - w, pin[1] - 24 - h], ['low', pin[0], pin[3] + 14], ['low r', pin[2] - w, pin[3] + 14]];
    bub.dataset.seat = corners.map(([name, x, y]) => ({ name, hits: hits(x, y) })).sort((a, b) => a.hits - b.hits)[0].name;
  }, []);

  // The map. Its handlers hold the wall, show the way on, and let go of an open ticket.
  useEffect(() => {
    let gone = false, made: GlMap | null = null, flash = 0, holding = false;
    import('maplibre-gl').then(mod => {
      if (gone || !canvas.current || !host.current) return;
      const gl = ((mod as { default?: unknown }).default ?? mod) as { Map: typeof GlMap; Marker: typeof Marker };
      lib.current = gl;
      const s = live.current, inks = paints(host.current), art = swatches(inks) as Record<string, { width: number; height: number; data: Uint8ClampedArray } | null>;
      const map = made = new gl.Map({ container: canvas.current, style: style(inks, s.land, s.here), center: middle(s.here.ring), zoom: 14.5, maxZoom: 18, canvasContextAttributes: { antialias: true }, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false });
      map.touchZoomRotate.disableRotation();
      map.on('styleimagemissing', (event: { id: string }) => { const made = art[event.id]; if (made && !map.hasImage(event.id)) map.addImage(event.id, made, { pixelRatio: 3 }); });
      const bump = () => { if (flash || calm()) return; map.setPaintProperty('rim', 'line-width', 6); flash = window.setTimeout(() => { flash = 0; if (!gone) map.setPaintProperty('rim', 'line-width', 2.2); }, 240); };
      const drop = () => { wallAt.current = null; setWall(null); };
      map.on('move', (event: MapLibreEvent) => {
        place(map); tune(map);
        const s = live.current;
        if (!event.originalEvent || holding || s.open) return;
        const c = map.getCenter(), view = cam(), [x, y] = held(view.box, view.floor, [c.lng, c.lat], map.getZoom());
        if (Math.abs(x - c.lng) > 1e-7 || Math.abs(y - c.lat) > 1e-7) {
          holding = true; map.setCenter([x, y]); holding = false; bump();
          const found = wayOn(s.land, s.here.id, s.standing, [c.lng - x, c.lat - y], s.on);
          if (!found) return;
          wallAt.current = { ...found, at: [x, y], view: s.here.id };
          setWall(was => was && was.id === found.id && was.kind === found.kind && was.view === s.here.id ? was : { id: found.id, kind: found.kind, view: s.here.id });
          place(map);
        } else if (wallAt.current) {
          // Moving back off the wall takes the way on away.
          const a = map.project(wallAt.current.at), b = map.project(c);
          if (Math.hypot(a.x - b.x, a.y - b.y) > 46) drop();
        }
      });
      // The second ink shifts a hair with your hand, the way a print catches the light.
      map.on('mousemove', (event: MapMouseEvent) => {
        const w = host.current?.clientWidth || 1, h = host.current?.clientHeight || 1, at = ink.current;
        at.hand = [(event.point.x / w - .5) * 3, (event.point.y / h - .5) * 3];
        map.setPaintProperty('off', 'fill-translate', [at.rest[0] + at.hand[0], at.rest[1] + at.hand[1]]);
      });
      map.on('moveend', () => { seat(); if (!live.current.open) map.setMinZoom(cam().floor); });
      map.on('click', (event: MapMouseEvent) => { const s = live.current; if (s.picked && !(event.originalEvent.target as Element | null)?.closest?.('.maplibregl-marker')) s.onPick(null); });
      map.on('resize', () => map.jumpTo(cam()));
      setMap(map);
    });
    return () => { gone = true; clearTimeout(flash); made?.remove(); setMap(null); };
  }, [cam, place, seat, tune]);

  // Where you are, if the browser will say. Standing in a section makes it yours; anywhere else leaves you where the most is on.
  const find = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(found => {
      const spot: Point = [found.coords.longitude, found.coords.latitude], sec = sectionAt(land, spot);
      if (!sec) { setYou(null); setWhere('away'); return; }
      setYou(spot); setStanding(sec.id); setView(sec.id); setLitId(null); setWhere('here');
    }, () => setWhere('off'), { maximumAge: 60000, timeout: 8000 });
  }, [land]);
  useEffect(() => { find(); }, [find]);
  // What the locate button found is said beside it for a few seconds, when it is not simply "here".
  const [told, setTold] = useState(false);
  useEffect(() => { if (!told) return; const done = setTimeout(() => setTold(false), 5000); return () => clearTimeout(done); }, [told, where]);
  useEffect(() => { onYou?.(you); }, [you, onYou]);

  // The section on screen is cut out of the veil, and its margins name the sections next door.
  useEffect(() => {
    if (!map) return;
    const set = (id: string, data: object) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data as Parameters<GeoJSONSource['setData']>[0]);
    const put = () => { set('veil', veil(here)); set('plate', plate(here)); set('margins', margins(land, here)); };
    if (map.getSource('veil')) put(); else map.once('load', put);
  }, [map, land, here]);

  // Turning the dial draws your walk on, from you to the plan, and the second ink slides into register across the whole sheet.
  const litKey = lit?.ticket.id ?? null, openAt = open?.at.join() ?? null, youAt = you?.join() ?? null, litAt = lit?.at.join() ?? null;
  useEffect(() => {
    if (!map) return;
    const s = live.current, from = view === standing ? s.you : null, to = s.open?.at ?? s.lit?.at ?? null;
    let stop = () => {}, stopInk = () => {}, done = false;
    const put = () => {
      if (done) return;
      (map.getSource('mins') as GeoJSONSource | undefined)?.setData(walkLabel(s.open ? null : from, to));
      stop = tween(700, t => (map.getSource('walk') as GeoJSONSource | undefined)?.setData(walkLine(from, to, t)));
      stopInk = tween(620, t => { const at = ink.current; at.rest = [REST[0] + (1 - t) * 9, REST[1] + (1 - t) * 7]; map.setPaintProperty('off', 'fill-translate', [at.rest[0] + at.hand[0], at.rest[1] + at.hand[1]]); });
    };
    if (map.getSource('walk')) put(); else map.once('load', put);
    return () => { done = true; stop(); stopInk(); };
  }, [map, litAt, openAt, youAt, view, standing]);

  // A stamp for each plan in the section. Plans at one address fan out, so none hides another.
  useEffect(() => {
    if (!map || !lib.current) return;
    const { Marker } = lib.current, same = new Map<string, number>();
    const made = pins.map(pin => {
      const key = pin.at.join(), nth = same.get(key) ?? 0;
      same.set(key, nth + 1);
      return new Marker({ element: pin.el, anchor: 'bottom-left', offset: [nth * 40 - 24, nth * -14 + 6] }).setLngLat(pin.at).addTo(map);
    });
    marks.current = pins; place(map);
    return () => { for (const each of made) each.remove(); };
  }, [map, pins, place]);
  useEffect(() => {
    if (!map || !lib.current || !you || !youEl) return;
    const marker = new lib.current.Marker({ element: youEl }).setLngLat(you).addTo(map);
    return () => { marker.remove(); };
  }, [map, you, youEl]);
  useLayoutEffect(seat);

  // The view follows the section, the plan that is on, and the open ticket.
  useEffect(() => {
    if (!map) return;
    // Opening a ticket walks the view to its stamp and leans in. Letting go of it steps back.
    const { open } = live.current, to = cam(), slow = framed.current && !calm(), aim = open ? { ...to, center: open.at, zoom: Math.min(CLOSE + .4, to.zoom + .5) } : to;
    // The ticket is dealt afresh: it is whole again, and "away" is measured from where the view comes to rest.
    const settle = () => { const on = live.current.lit, at = on ? map.project(on.at) : null; home.current = at ? { zoom: map.getZoom(), x: at.x, y: at.y } : null; tune(map); };
    home.current = null; host.current?.style.setProperty('--away', '0');
    map.setMinZoom(0);
    if (slow) { map.once('moveend', settle); map.easeTo({ ...aim, duration: open ? 650 : 900 }); } else { map.jumpTo(aim); if (!open) map.setMinZoom(to.floor); settle(); }
    framed.current = true;
  }, [map, cam, tune, view, litKey, openAt, youAt, standing, picked]);

  const step = (id: string) => { wallAt.current = null; setWall(null); setView(id); setLitId(null); onPick(null); };
  /** One step in or out, about the middle of the map. How far out it goes is the section's own limit. */
  const zoom = (by: number) => map?.easeTo({ zoom: map.getZoom() + by, duration: calm() ? 0 : 300 });
  /** Back to where you stand; there already, back to how the view started. */
  const recenter = () => { if (view !== standing) step(standing); else if (map) { const to = cam(); map.setMinZoom(0); home.current = null; map.easeTo({ ...to, duration: calm() ? 0 : 450 }); } };
  /** The locate button: ask the browser again where you are, say what it found, and go back to where you stand. */
  const locate = () => { if (where !== 'here' && navigator.geolocation) setWhere('wait'); setTold(true); find(); recenter(); };

  const away = hops(land, standing, view), walk = (to: Point) => you ? walkMinutes(you, to) : null;
  const kicker = away ? [`${away} ${away === 1 ? 'step' : 'steps'} from ${you ? 'you' : 'the start'}`, you ? `${walk(middle(here.ring))} min walk` : null].filter(Boolean).join(' · ')
    : where === 'here' ? 'You are here' : visiting(swap) ? 'Visiting' : where === 'away' ? 'You are away from campus' : where === 'off' ? 'Your location is off' : 'Finding you';
  const shown = wall && !up && wall.view === view ? wall : null, there = shown?.id ? land.find(each => each.id === shown.id) : undefined;

  const pin = (spot: Spot, nth: number) => {
    const { ticket } = spot, isLit = !up && lit?.ticket.id === ticket.id, faces = ticket.mine ? ticket.mine.members : ticket.known;
    const reward = ticket.stub.kind === 'none' ? null : ticket.stub.text, mins = view === standing ? walk(spot.at) : null;
    return <button className={`cs-pin ${isLit || up === ticket.id ? 'sel' : ''} ${up && up !== ticket.id ? 'dim' : ''} ${hot === ticket.id ? 'hov' : ''} ${ticket.action === 'checkin' ? 'now' : ''}`} style={{ '--lean': `${[-4, 3, -2, 4, -3][nth % 5]}deg` } as CSSProperties}
      aria-label={`${ticket.title}, ${ticket.day} ${ticket.time}`} {...(beside ? { 'aria-pressed': isLit } : { 'aria-expanded': up === ticket.id })} onMouseEnter={() => onHover?.(ticket.id)} onMouseLeave={() => onHover?.(null)} onClick={() => { setLitId(ticket.id); onPick(picked === ticket.id ? null : ticket.id); }}>
      <span className="cs-postage">{isLit && <svg className="cs-burst" viewBox="-55 -55 110 110" aria-hidden="true"><path d={BURST} /></svg>}
        <span><svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[pictureOf(ticket)]}</svg><b>{ticket.time}</b><small>{ticket.day}</small></span></span>
      {isLit && <Postmark town={here.name} time={ticket.time} day={ticket.day} />}
      {faces.length > 0 && <span className="cs-stack">{faces.slice(0, 3).map((face, n) => <FaceDot key={n} face={face} />)}</span>}
      {isLit && <span className="cs-bub"><span className="main"><b>{ticket.title}</b><span>{ticket.place ?? ticket.map?.name}</span>{reward && <em>{reward}</em>}<span className="in">{ticket.stub.say}</span></span>
        {mins !== null && <span className="stub"><b>{mins}</b><small>min<br />walk</small></span>}</span>}
    </button>;
  };

  return <div className={`cs-near ${up ? 'picked' : ''}`} ref={host}>
    <svg className="cs-near-defs" width={0} height={0} aria-hidden="true"><defs><path id="cs-arc-over" d="M-21 0a21 21 0 0 1 42 0" /><path id="cs-arc-under" d="M-22 0a22 22 0 0 0 44 0" /></defs>
      <filter id="cs-rough" x="-2%" y="-2%" width="104%" height="104%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves={2} seed={7} /><feDisplacementMap in="SourceGraphic" scale={2.4} /></filter></svg>
    <div className="cs-near-map" ref={canvas} /><i className="cs-near-tooth" /><i className="cs-near-age" />
    <div className={`cs-near-band ${swap.length > 1 ? 'swaps' : ''}`} ref={band}><p><b>{kicker}</b> · {list.length} on · <i>sheet {land.indexOf(here) + 1} of {land.length}</i></p><h2>{here.name}</h2><small>Map © OpenStreetMap, OpenFreeMap</small></div>
    <Swap campuses={swap} />
    {shown && (shown.kind === 'go' && there
      ? <button className="cs-way" ref={el => { way.current = el; if (el && map) place(map); }} aria-label={`Go to ${there.name}`} onClick={() => step(there.id)}>
          <span><b>{there.name}</b>{[there.id === standing ? (you ? 'Where you stand' : 'Where you started') : you ? `${walk(middle(there.ring))} min walk` : null, `${on[there.id]} on`].filter(Boolean).join(' · ')}</span><Arrow /></button>
      : <div className="cs-way none" role="status" key={`${shown.id}|${shown.kind}`} ref={el => { way.current = el; if (el && map) place(map); }}>
          <span><b>{there?.name ?? 'Coming soon'}</b>{shown.kind === 'far' ? 'Not open from here yet' : shown.kind === 'empty' ? 'Nothing on yet. Coming soon' : 'Nothing this way yet'}</span>{there && <Arrow />}</div>)}
    {!up && <>
      {/* The map's own controls, in one pill: find where you are, then in and out. The locate mark shows what the
          browser said: a filled centre when you are on the map, struck through when you are away or location is off. */}
      <div className="cs-zoom" role="group" aria-label="Map">
        <button className="cs-loc" data-where={where} aria-label="Back to where you are" title={where === 'here' ? 'Back to where you are' : 'Find where you are'} onClick={locate}><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx={8} cy={8} r={4.2} /><path d="M8 1.2v2.6M8 12.2v2.6M1.2 8h2.6M12.2 8h2.6" />{where === 'here' ? <circle className="dot" cx={8} cy={8} r={1.9} /> : where !== 'wait' && <path className="struck" d="M2.6 2.6l10.8 10.8" />}</svg></button>
        <button aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg></button>
        <button aria-label="Zoom out" title="Zoom out" onClick={() => zoom(-1)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg></button></div>
      {told && where !== 'here' && <p className="cs-loc-note" role="status">{where === 'wait' ? 'Finding you' : where === 'away' ? 'You are away from this campus, so you are not on its map' : 'Your location is off. Allow it in your browser to see yourself here'}</p>}
      <div className="cs-scale" ref={rule} style={{ bottom: beside ? (list.length ? 16 : 100) : (lit ? DIAL : 84) + 16 }} aria-hidden="true"><i /></div></>}
    {(!beside || !list.length) && <div className={`cs-near-sheet ${up ? 'open' : lit ? 'dial' : ''}`} ref={sheet}>
      {up ? children : lit ? <Dial list={list} at={at} onTurn={to => setLitId(list[to].ticket.id)} onOpen={() => onPick(lit.ticket.id)} />
        : <p className="cs-near-none"><b>{asked ? `Nothing in ${here.name} for “${asked}”` : `Nothing on in ${here.name} yet`}</b>{asked ? 'Try another word, or push the edge of the map to look next door.' : 'Push the edge of the map to look next door.'}</p>}</div>}
    {pins.map((each, nth) => { const spot = list.find(one => one.ticket.id === each.id); return spot ? createPortal(pin(spot, nth), each.el, each.id) : null; })}
    {youEl && createPortal(<span className="cs-you">{me ? <FaceDot face={{ ...me, me: true }} /> : <i />}<b>YOU</b></span>, youEl)}
  </div>;
}

/** The sheet is only a rail of times. Drag along it, or use the arrow keys, and the plan hands over its ticket. A tap on the time that is on opens it. */
function Dial({ list, at, onTurn, onOpen }: { list: Spot[]; at: number; onTurn: (to: number) => void; onOpen: () => void }) {
  const rail = useRef<HTMLDivElement>(null), drag = useRef({ down: false, moved: false });
  const n = list.length, pos = (k: number) => n < 2 ? 50 : 8 + k * 84 / (n - 1);
  const turn = (to: number) => { if (to !== at) { drag.current.moved = true; onTurn(to); } };
  const under = (event: PointerEvent) => [...rail.current!.querySelectorAll<HTMLElement>('.cs-tick')].map((tick, k) => { const r = tick.getBoundingClientRect(); return { k, gap: Math.abs(r.left + r.width / 2 - event.clientX) }; }).sort((a, b) => a.gap - b.gap)[0].k;
  // With more times than fit, the rail is longer than the sheet, and the time that is on is kept in view once the finger lifts.
  useEffect(() => {
    const el = rail.current, tick = el?.querySelector<HTMLElement>('.cs-tick.on');
    if (el && tick && !drag.current.down) el.scrollTo?.({ left: tick.offsetLeft - el.clientWidth / 2, behavior: calm() ? 'auto' : 'smooth' });
  }, [at, n]);
  const key = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') turn(Math.min(n - 1, at + 1)); else if (event.key === 'ArrowLeft') turn(Math.max(0, at - 1)); else if (event.key === 'Enter' || event.key === ' ') onOpen(); else return;
    event.preventDefault();
  };
  return <div className="cs-dial" ref={rail} role="slider" tabIndex={0} aria-label="What is on, in order of time" aria-valuemin={1} aria-valuemax={n} aria-valuenow={at + 1} aria-valuetext={`${list[at].ticket.title}, ${list[at].ticket.day} ${list[at].ticket.time}`}
    onPointerDown={event => { drag.current = { down: true, moved: false }; event.currentTarget.setPointerCapture?.(event.pointerId); turn(under(event)); }}
    onPointerMove={event => { if (drag.current.down) turn(under(event)); }}
    onPointerUp={() => { drag.current.down = false; }} onPointerCancel={() => { drag.current.down = false; }}
    onClick={() => { if (!drag.current.moved) onOpen(); }} onKeyDown={key}>
    <div style={{ width: `max(100%, ${n * 72}px)` }}>{list.map((spot, k) => <span key={spot.ticket.id} className={`cs-tick ${k === at ? 'on' : ''}`} style={{ left: `${pos(k)}%` }}><small>{spot.ticket.day}</small><b>{spot.ticket.time}</b></span>)}</div>
  </div>;
}
