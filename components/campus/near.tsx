'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { GeoJSONSource, Map as GlMap, MapLibreEvent, MapMouseEvent, Marker, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { bounds, held, hops, middle, sectionAt, walkMinutes, wayOn, type Point, type Section, type Way } from '@/lib/campus/sections';
import type { Face, Ticket } from '@/lib/campus/view';
import { FaceDot, Tile } from './screen';

// "Near you": the week on a map, one section of town at a time. Ported from public/demo/mockups-campus-map-app.html.
// The map is the list: each event is a pin, the dial under the map turns through them in order of time, and the one
// that is on speaks from its pin. The view cannot leave the section (lib/campus/sections.ts, "The wall"). Pushing
// against the wall shows the way on at that edge. Streets are OpenStreetMap data drawn by MapLibre GL from OpenFreeMap
// tiles, which need no key. The map library is loaded only when this view is opened.

const CLOSE = 17.2;   // as close as the view goes by itself
const DIAL = 110;     // the height of the sheet while it holds the dial
type Spot = { ticket: Ticket; at: Point; sec: string };
type Where = 'wait' | 'here' | 'away' | 'off';
type Wall = Way & { at: Point; view: string };
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const count = (spots: readonly Spot[]) => spots.reduce<Record<string, number>>((sum, spot) => ({ ...sum, [spot.sec]: (sum[spot.sec] ?? 0) + 1 }), {});
const Arrow = () => <i className="go"><svg viewBox="-8 -8 16 16" aria-hidden="true"><path d="M-6 0H6M1 -5l5 5-5 5" /></svg></i>;

/** MapLibre reads RGB only. Each colour is taken from the page's own colours, so a school's colours recolour the map. */
function paints(host: HTMLElement) {
  const probe = host.appendChild(document.createElement('i')), ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgb = (css: string) => {
    probe.style.color = css;
    if (!ctx) return 'rgb(128,128,128)';
    ctx.fillStyle = getComputedStyle(probe).color; ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r},${g},${b})`;
  };
  const mix = (a: string, share: number, b: string) => rgb(`color-mix(in oklab, var(--cs-${a}) ${share}%, var(--cs-${b}))`);
  const out = { ink: rgb('var(--cs-ink)'), paper: rgb('var(--cs-paper)'), ground: mix('field', 60, 'field-shadow'), park: mix('field-shadow', 80, 'field'), minor: mix('field', 50, 'paper'),
    shade: mix('field-shadow', 78, 'ink'), water: rgb('oklch(62% 0.13 245)') };
  probe.remove();
  return out;
}

const shape = (ring: readonly Point[]) => [...ring, ring[0]];
const plate = (here: Section) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [shape(here.ring)] } });
/** Everything but the section on screen: a wide square with the section cut out of it. */
const veil = (here: Section) => { const [x, y] = middle(here.ring);
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [[[x - .4, y - .35], [x + .4, y - .35], [x + .4, y + .35], [x - .4, y + .35], [x - .4, y - .35]], shape(here.ring)] } }; };
/** A straight dotted line from you to the event that is open: which way and how far, not the route. */
const walkLine = (from: Point | null, to: Point | null) => ({ type: 'FeatureCollection' as const, features: from && to ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [from, to] } }] : [] });

function style(c: ReturnType<typeof paints>, here: Section): StyleSpecification {
  const wide = (px: number) => ['interpolate', ['exponential', 2], ['zoom'], 13, px / 8, 16, px, 19, px * 8];
  const omt = (id: string, type: string, layer: string, paint: object, more: object = {}) => ({ id, type, source: 'omt', 'source-layer': layer, paint, ...more });
  const road = (id: string, classes: string[], color: string, px: number, extra: object = {}) => omt(id, 'line', 'transportation', { 'line-color': color, 'line-width': wide(px), ...extra },
    { filter: ['all', ['==', ['geometry-type'], 'LineString'], ['match', ['get', 'class'], classes, true, false]], layout: { 'line-cap': 'round', 'line-join': 'round' } });
  const geo = (data: object) => ({ type: 'geojson', data });
  return { version: 8,
    sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' }, veil: geo(veil(here)), plate: geo(plate(here)), walk: geo(walkLine(null, null)) },
    layers: [{ id: 'ground', type: 'background', paint: { 'background-color': c.ground } },
      omt('green', 'fill', 'landcover', { 'fill-color': c.park }), omt('park', 'fill', 'park', { 'fill-color': c.park }),
      omt('water', 'fill', 'water', { 'fill-color': c.water }), omt('stream', 'line', 'waterway', { 'line-color': c.water, 'line-width': wide(5) }),
      road('path', ['path', 'track'], c.paper, 2.4, { 'line-dasharray': [.1, 2.2] }), road('minor', ['minor', 'service'], c.minor, 9), road('major', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], c.paper, 15),
      omt('shade', 'fill', 'building', { 'fill-color': c.shade, 'fill-translate': [3, 3], 'fill-translate-anchor': 'viewport' }), omt('roofs', 'fill', 'building', { 'fill-color': c.paper }),
      { id: 'walk', type: 'line', source: 'walk', layout: { 'line-cap': 'round' }, paint: { 'line-color': c.ink, 'line-width': 5, 'line-dasharray': [.1, 1.9] } },
      { id: 'veil', type: 'fill', source: 'veil', paint: { 'fill-color': c.ink, 'fill-opacity': .93 } },
      { id: 'rim', type: 'line', source: 'plate', layout: { 'line-join': 'round' }, paint: { 'line-color': c.paper, 'line-width': 3.5 } }] } as unknown as StyleSpecification;
}

export type NearProps = {
  land: Section[];
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
};

export function Near({ land, tickets, me, asked, picked, onPick, children }: NearProps) {
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
  const [wall, setWall] = useState<Pick<Wall, 'id' | 'kind' | 'view'> | null>(null), [ends, setEnds] = useState({ close: false, far: false });

  const here = land.find(each => each.id === view)!, list = useMemo(() => spots.filter(spot => spot.sec === view), [spots, view]);
  const at = Math.max(0, list.findIndex(spot => spot.ticket.id === litId)), lit = list[at] ?? null;
  const open = picked ? spots.find(spot => spot.ticket.id === picked) ?? null : null;
  // What the map hangs each pin on. The map places these; the page draws the pins inside them.
  const pins = useMemo(() => typeof document === 'undefined' ? [] : list.map(spot => ({ id: spot.ticket.id, at: spot.at, el: document.createElement('div') })), [list]);
  const youEl = useMemo(() => you && view === standing && typeof document !== 'undefined' ? document.createElement('div') : null, [you, view, standing]);

  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLDivElement>(null), band = useRef<HTMLDivElement>(null), sheet = useRef<HTMLDivElement>(null), way = useRef<HTMLElement>(null);
  const lib = useRef<{ Marker: typeof Marker } | null>(null), wallAt = useRef<Wall | null>(null), marks = useRef<{ el: HTMLElement; at: Point }[]>([]), framed = useRef(false);
  // What the map's own handlers read: they are set up once and must see the screen as it is now.
  const now = { land, here, standing, you, lit, open, on, picked, onPick };
  const live = useRef(now);
  useLayoutEffect(() => { live.current = now; });

  /** Where the view should be. `floor` is the whole section in view: as far out as it goes. */
  const cam = useCallback(() => {
    const s = live.current, box = bounds(s.here.ring), k = Math.cos(box.centre[1] * Math.PI / 180);
    const w = host.current?.clientWidth ?? 400, h = host.current?.clientHeight ?? 600, top = band.current?.offsetHeight ?? 0, low = sheet.current?.offsetHeight ?? DIAL;
    const zoomFor = (mpp: number) => Math.log2(40075016.686 * k / (512 * mpp));
    const floor = zoomFor(Math.max((box.east - box.west) * 111320 * k / Math.max(160, w - 36), (box.north - box.south) * 110540 / Math.max(160, h - top - DIAL - 150))) - .22;
    // It starts as close as it can: you and the event that is on just fit, and the map travels as the dial turns.
    // Next door, or with no spot of your own, it sits on the event alone. With nothing on it goes close on where you stand.
    const home = s.here.id === s.standing;
    let center: Point = s.lit ? s.lit.at : home ? s.you ?? s.here.rest : box.centre, zoom = CLOSE - (s.lit ? .7 : 0);
    if (s.lit && home && s.you) {
      const a = s.you, b = s.lit.at, mpp = Math.max(Math.abs(a[0] - b[0]) * 111320 * k / Math.max(160, w - 150), Math.abs(a[1] - b[1]) * 110540 / Math.max(160, h - top - DIAL - 190), 1e-9);
      center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; zoom = Math.min(CLOSE - .4, zoomFor(mpp) - .3);
    }
    zoom = Math.max(floor, zoom);
    if (!s.open) center = held(box, floor, center, zoom);
    return { center, zoom, floor, box, pitch: 36, bearing: -14, padding: { top: top + (s.open ? 0 : 40), bottom: low, left: 0, right: s.open ? 0 : 60 } };
  }, []);

  /** Pins near the right edge turn to face inward, and the way on sits where the push leaves the view. */
  const place = useCallback((map: GlMap) => {
    const w = host.current?.clientWidth ?? 0, h = host.current?.clientHeight ?? 0, top = band.current?.offsetHeight ?? 0, low = h - (sheet.current?.offsetHeight ?? DIAL);
    for (const mark of marks.current) mark.el.classList.toggle('far', map.project(mark.at).x > w - 84);
    const el = way.current, pushed = wallAt.current;
    if (!el || !pushed) return;
    const c = map.getCenter(), from = map.project(c), to = map.project([c.lng + pushed.toward[0] * .002 / Math.cos(c.lat * Math.PI / 180), c.lat + pushed.toward[1] * .002]);
    const dx = to.x - from.x, dy = to.y - from.y, mx = w / 2, my = (top + low - 60) / 2, ew = el.offsetWidth, eh = el.offsetHeight;
    const reach = Math.min((mx - 12 - ew / 2) / (Math.abs(dx) || 1e-6), ((low - 60 - top) / 2 - 12 - eh / 2) / (Math.abs(dy) || 1e-6));
    el.style.setProperty('--a', `${Math.atan2(dy, dx)}rad`);
    el.style.flexDirection = dx < -Math.abs(dy) ? 'row-reverse' : '';   // pointing left, the arrow leads
    el.style.transform = `translate(${Math.round(mx + dx * reach - ew / 2)}px, ${Math.round(my + dy * reach - eh / 2)}px)`;
  }, []);

  /** The bubble takes whichever corner of its pin covers the fewest other pins, and stays on the map. */
  const seat = useCallback(() => {
    const bub = host.current?.querySelector<HTMLElement>('.cs-bub'), frame = host.current?.getBoundingClientRect();
    if (!bub || !frame) return;
    const rect = (el: Element) => { const r = el.getBoundingClientRect(); return [r.left - frame.left, r.top - frame.top, r.right - frame.left, r.bottom - frame.top]; };
    const pin = rect(bub.parentElement!), w = bub.offsetWidth, h = bub.offsetHeight, top = band.current?.offsetHeight ?? 0, low = frame.height - (sheet.current?.offsetHeight ?? DIAL);
    const others = [...host.current!.querySelectorAll('.cs-pin, .cs-you, .cs-way, .cs-near-zoom')].filter(el => el !== bub.parentElement).map(rect);
    const hits = (x: number, y: number) => others.filter(o => x < o[2] && o[0] < x + w && y < o[3] && o[1] < y + h).length + (x < 4 || x + w > frame.width - 4 || y < top + 4 || y + h > low - 4 ? 100 : 0);
    const corners: [string, number, number][] = [['', pin[0], pin[1] - 9 - h], ['r', pin[2] - w, pin[1] - 9 - h], ['low', pin[0], pin[3] + 9], ['low r', pin[2] - w, pin[3] + 9]];
    bub.dataset.seat = corners.map(([name, x, y]) => ({ name, hits: hits(x, y) })).sort((a, b) => a.hits - b.hits)[0].name;
  }, []);

  // The map. Its handlers hold the wall, show the way on, and let go of an open ticket.
  useEffect(() => {
    let gone = false, made: GlMap | null = null, flash = 0, holding = false;
    import('maplibre-gl').then(mod => {
      if (gone || !canvas.current || !host.current) return;
      const gl = ((mod as { default?: unknown }).default ?? mod) as { Map: typeof GlMap; Marker: typeof Marker };
      lib.current = gl;
      const s = live.current, map = made = new gl.Map({ container: canvas.current, style: style(paints(host.current), s.here), center: middle(s.here.ring), zoom: 14.5, maxZoom: 18, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false });
      map.touchZoomRotate.disableRotation();
      const bump = () => { if (flash || calm()) return; map.setPaintProperty('rim', 'line-width', 9); flash = window.setTimeout(() => { flash = 0; if (!gone) map.setPaintProperty('rim', 'line-width', 3.5); }, 240); };
      const drop = () => { wallAt.current = null; setWall(null); };
      map.on('move', (event: MapLibreEvent) => {
        place(map);
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
      const edges = () => setEnds(was => { const next = { close: map.getZoom() >= map.getMaxZoom() - .01, far: map.getZoom() <= map.getMinZoom() + .01 }; return was.close === next.close && was.far === next.far ? was : next; });
      map.on('zoom', edges);
      map.on('moveend', () => { edges(); seat(); if (!live.current.open) map.setMinZoom(cam().floor); });
      map.on('click', (event: MapMouseEvent) => { const s = live.current; if (s.picked && !(event.originalEvent.target as Element | null)?.closest?.('.maplibregl-marker')) s.onPick(null); });
      map.on('resize', () => map.jumpTo(cam()));
      setMap(map);
    });
    return () => { gone = true; clearTimeout(flash); made?.remove(); setMap(null); };
  }, [cam, place, seat]);

  // Where you are, if the browser will say. Standing in a section makes it yours; anywhere else leaves you where the most is on.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(found => {
      const spot: Point = [found.coords.longitude, found.coords.latitude], sec = sectionAt(land, spot);
      if (!sec) { setWhere('away'); return; }
      setYou(spot); setStanding(sec.id); setView(sec.id); setLitId(null); setWhere('here');
    }, () => setWhere('off'), { maximumAge: 60000, timeout: 8000 });
  }, [land]);

  // The section on screen is cut out of the veil.
  useEffect(() => {
    if (!map) return;
    const put = () => { (map.getSource('veil') as GeoJSONSource | undefined)?.setData(veil(here)); (map.getSource('plate') as GeoJSONSource | undefined)?.setData(plate(here)); };
    if (map.getSource('veil')) put(); else map.once('load', put);
  }, [map, here]);
  useEffect(() => {
    if (!map) return;
    const put = () => (map.getSource('walk') as GeoJSONSource | undefined)?.setData(walkLine(open && view === standing ? you : null, open?.at ?? null));
    if (map.getSource('walk')) put(); else map.once('load', put);
  }, [map, open, view, standing, you]);

  // A pin for each event in the section. Events at one address fan out, so none hides another.
  useEffect(() => {
    if (!map || !lib.current) return;
    const { Marker } = lib.current, same = new Map<string, number>();
    const made = pins.map(pin => {
      const key = pin.at.join(), nth = same.get(key) ?? 0;
      same.set(key, nth + 1);
      return new Marker({ element: pin.el, anchor: 'bottom-left', offset: [nth * 34, nth * -12] }).setLngLat(pin.at).addTo(map);
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

  // The view follows the section, the event that is on, and the open ticket.
  const litKey = lit?.ticket.id ?? null, openAt = open?.at.join() ?? null, youAt = you?.join() ?? null;
  useEffect(() => {
    if (!map) return;
    // Opening a ticket walks the view to its pin and leans in. Letting go of it steps back.
    const { open } = live.current, to = cam(), slow = framed.current && !calm(), aim = open ? { ...to, center: open.at, zoom: Math.min(CLOSE + .4, to.zoom + .5) } : to;
    map.setMinZoom(0);
    if (slow) map.easeTo({ ...aim, duration: open ? 650 : 450 }); else { map.jumpTo(aim); if (!open) map.setMinZoom(to.floor); }
    framed.current = true;
  }, [map, cam, view, litKey, openAt, youAt, standing, picked]);

  const step = (id: string) => { wallAt.current = null; setWall(null); setView(id); setLitId(null); onPick(null); };
  /** The buttons zoom inside the wall too: zooming out brings the view back toward the middle, so the next drag never jumps. */
  const zoomBy = (by: number) => { if (!map) return;
    const to = cam(), c = map.getCenter(), zoom = Math.max(to.floor, Math.min(map.getMaxZoom(), map.getZoom() + by));
    map.easeTo({ zoom, center: held(to.box, to.floor, [c.lng, c.lat], zoom), duration: calm() ? 0 : 280 }); };
  /** Back to where you stand; there already, back to how the view started. */
  const recenter = () => { if (view !== standing) step(standing); else if (map) { const to = cam(); map.setMinZoom(0); map.easeTo({ ...to, duration: calm() ? 0 : 450 }); } };

  const away = hops(land, standing, view), walk = (to: Point) => you ? `${walkMinutes(you, to)} min walk` : null;
  const kicker = away ? [`${away} ${away === 1 ? 'step' : 'steps'} from ${you ? 'you' : 'the start'}`, walk(middle(here.ring))].filter(Boolean).join(' · ')
    : where === 'here' ? 'You are here' : where === 'away' ? 'You are away from campus' : where === 'off' ? 'Your location is off' : 'Finding you';
  const shown = wall && !picked && wall.view === view ? wall : null, there = shown?.id ? land.find(each => each.id === shown.id) : undefined;

  const pin = (spot: Spot) => {
    const { ticket } = spot, isLit = !picked && lit?.ticket.id === ticket.id, faces = ticket.mine ? ticket.mine.members : ticket.known;
    const reward = ticket.stub.kind === 'none' ? null : ticket.stub.text;
    return <button className={`cs-pin ${isLit || picked === ticket.id ? 'sel' : ''} ${picked && picked !== ticket.id ? 'dim' : ''} ${ticket.action === 'checkin' ? 'now' : ''}`}
      aria-label={`${ticket.title}, ${ticket.day} ${ticket.time}`} aria-expanded={picked === ticket.id} onClick={() => { setLitId(ticket.id); onPick(picked === ticket.id ? null : ticket.id); }}>
      <Tile top={ticket.day} big={ticket.time} />
      {faces.length > 0 && <span className="cs-stack">{faces.slice(0, 3).map((face, n) => <FaceDot key={n} face={face} />)}</span>}
      {isLit && <span className="cs-bub"><b>{ticket.title}</b><span>{[ticket.place ?? ticket.map?.name, walk(spot.at)].filter(Boolean).join(' · ')}</span>
        {reward && <em>{reward}</em>}<span className="in">{ticket.stub.say}</span></span>}
    </button>;
  };

  return <div className={`cs-near ${picked ? 'picked' : ''}`} ref={host}>
    <div className="cs-near-map" ref={canvas} />
    <div className="cs-near-band" ref={band}><p><b>{kicker}</b> · {list.length} on</p><h2>{here.name}</h2><small>Map © OpenStreetMap, OpenFreeMap</small></div>
    {shown && (shown.kind === 'go' && there
      ? <button className="cs-way" ref={el => { way.current = el; if (el && map) place(map); }} aria-label={`Go to ${there.name}`} onClick={() => step(there.id)}>
          <span><b>{there.name}</b>{[there.id === standing ? (you ? 'Where you stand' : 'Where you started') : walk(middle(there.ring)), `${on[there.id]} on`].filter(Boolean).join(' · ')}</span><Arrow /></button>
      : <div className="cs-way none" role="status" key={`${shown.id}|${shown.kind}`} ref={el => { way.current = el; if (el && map) place(map); }}>
          <span><b>{there?.name ?? 'Coming soon'}</b>{shown.kind === 'far' ? 'Not open from here yet' : shown.kind === 'empty' ? 'Nothing on yet. Coming soon' : 'Nothing this way yet'}</span>{there && <Arrow />}</div>)}
    {!picked && <div className="cs-near-zoom" style={{ bottom: (lit ? DIAL : 84) + 16 }}>
      <button aria-label="Recenter the map" onClick={recenter}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><circle cx={10} cy={10} r={5.2} /><circle cx={10} cy={10} r={1.6} fill="currentColor" stroke="none" /><path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" /></svg></button>
      <button aria-label="Zoom out" disabled={ends.far} onClick={() => zoomBy(-.8)}>−</button><button aria-label="Zoom in" disabled={ends.close} onClick={() => zoomBy(.8)}>+</button></div>}
    <div className={`cs-near-sheet ${picked ? 'open' : lit ? 'dial' : ''}`} ref={sheet}>
      {picked ? children : lit ? <Dial list={list} at={at} onTurn={to => setLitId(list[to].ticket.id)} onOpen={() => onPick(lit.ticket.id)} />
        : <p className="cs-near-none"><b>{asked ? `Nothing in ${here.name} for “${asked}”` : `Nothing on in ${here.name} yet`}</b>{asked ? 'Try another word, or push the edge of the map to look next door.' : 'Push the edge of the map to look next door.'}</p>}</div>
    {pins.map(each => { const spot = list.find(one => one.ticket.id === each.id); return spot ? createPortal(pin(spot), each.el, each.id) : null; })}
    {youEl && createPortal(<span className="cs-you">{me ? <FaceDot face={{ ...me, me: true }} /> : <i />}</span>, youEl)}
  </div>;
}

/** The sheet is only a rail of times. Drag along it, or use the arrow keys, and the event speaks from its pin. A tap on the time that is on opens its ticket. */
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
