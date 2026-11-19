import { describe, expect, it } from 'vitest';
import { bounds, held, hops, landOf, middle, reach, sectionAt, walkMinutes, wayOn, type Point } from '@/lib/campus/sections';

const land = landOf('cornell')!;
const sec = (id: string) => land.find(each => each.id === id)!;

describe('the sections of a campus', () => {
  it('has sections for Cornell and none for a campus nobody drew', () => {
    expect(land.map(each => each.name)).toEqual(['Downtown', 'Collegetown', 'West Campus', 'Central Campus', 'North Campus', 'Ag Quad']);
    expect(landOf('nowhere')).toBeNull();
  });

  it('touching goes both ways, and every resting spot is inside its own section', () => {
    for (const each of land) {
      expect(sectionAt(land, each.rest)?.id).toBe(each.id);
      for (const id of each.next) expect(sec(id).next).toContain(each.id);
    }
  });

  it('finds the section a spot is in, and none for a spot off the map', () => {
    expect(sectionAt(land, [-76.4857, 42.4466])?.id).toBe('central');   // Willard Straight Hall
    expect(sectionAt(land, [-76.4985, 42.4400])?.id).toBe('downtown');  // The Commons
    expect(sectionAt(land, [-73.9857, 40.7484])).toBeNull();
  });

  it('opens the section you stand in and the ones touching it, nothing further', () => {
    expect(reach(land, 'collegetown', 'collegetown')).toBe(true);
    expect(reach(land, 'collegetown', 'central')).toBe(true);
    expect(reach(land, 'collegetown', 'north')).toBe(false);
    expect(hops(land, 'collegetown', 'collegetown')).toBe(0);
    expect(hops(land, 'collegetown', 'central')).toBe(1);
    expect(hops(land, 'downtown', 'north')).toBe(3);
  });

  it('counts a walk in minutes, never under one', () => {
    expect(walkMinutes(sec('collegetown').rest, sec('collegetown').rest)).toBe(1);
    expect(walkMinutes(sec('collegetown').rest, middle(sec('central').ring))).toBeGreaterThan(4);
  });
});

describe('the wall', () => {
  const box = bounds(sec('collegetown').ring), far: Point = [box.east + 1, box.north + 1];

  it('does not let the view move at all when the whole section is in view', () => {
    expect(held(box, 14, far, 14)).toEqual(box.centre);
    expect(held(box, 14, far, 13)).toEqual(box.centre);
  });

  it('frees more of the section with each step closer, and never lets the view leave it', () => {
    const one = held(box, 14, far, 15), two = held(box, 14, far, 16);
    expect(one[0]).toBeCloseTo(box.centre[0] + (box.east - box.west) / 4);
    expect(two[0]).toBeGreaterThan(one[0]);
    expect(held(box, 14, far, 30)[0]).toBeLessThanOrEqual(box.east);
    const within: Point = [box.centre[0] + 1e-5, box.centre[1]];
    expect(held(box, 14, within, 16)).toEqual(within);
  });
});

describe('pushing against the wall', () => {
  const on = { central: 3, downtown: 2, collegetown: 4 };

  it('finds the place that lies that way', () => {
    expect(wayOn(land, 'collegetown', 'collegetown', [0, .001], on)).toMatchObject({ id: 'central', kind: 'go' });
    expect(wayOn(land, 'collegetown', 'collegetown', [-.001, 0], on)).toMatchObject({ id: 'downtown', kind: 'go' });
  });

  it('says so when nothing lies that way, and goes nowhere', () => {
    expect(wayOn(land, 'collegetown', 'collegetown', [.001, 0], on)).toMatchObject({ id: null, kind: 'none' });
  });

  it('greys out a place with nothing on, and one more than a step from where you stand', () => {
    expect(wayOn(land, 'collegetown', 'collegetown', [0, .001], { downtown: 2 })).toMatchObject({ id: 'central', kind: 'empty' });
    // Looking at Central Campus while standing in Collegetown: West Campus is two steps away.
    expect(wayOn(land, 'central', 'collegetown', [-.001, 0], { west: 5 })).toMatchObject({ id: 'west', kind: 'far' });
  });

  it('points the way of the push, and makes nothing of no push', () => {
    const way = wayOn(land, 'collegetown', 'collegetown', [0, .5], on)!;
    expect(way.toward[0]).toBeCloseTo(0); expect(way.toward[1]).toBeCloseTo(1);
    expect(wayOn(land, 'collegetown', 'collegetown', [0, 0], on)).toBeNull();
  });
});

describe('New York: one stop is one section', () => {
  const city = landOf('cornell-tech')!, at = (id: string) => city.find(each => each.id === id)!;
  const TECH: Point = [-73.9566, 40.7558], LIGHTHOUSE: Point = [-73.9402, 40.7727], MOTORGATE: Point = [-73.94687, 40.76489];

  it('has the island and one stop each way, each resting inside itself and touching both ways', () => {
    expect(city.map(each => each.id)).toEqual(['roosevelt', 'lex63', 'queensbridge']);
    for (const each of city) {
      expect(sectionAt(city, each.rest)?.id).toBe(each.id);
      for (const id of each.next) expect(at(id).next).toContain(each.id);
    }
  });

  it('the whole island is one section: the campus, Motorgate and the lighthouse', () => {
    for (const spot of [TECH, MOTORGATE, LIGHTHOUSE]) expect(sectionAt(city, spot)?.id).toBe('roosevelt');
  });

  it('every section carries its stop and lines, and no corner of one lies inside another', () => {
    expect(city.map(each => [each.stop?.name, each.stop?.lines.join('')])).toEqual([['Roosevelt Island', 'FM'], ['Lexington Av/63 St', 'FMQ'], ['21 St–Queensbridge', 'FM']]);
    for (const a of city) for (const b of city) if (a !== b) for (const corner of a.ring) expect(sectionAt([b], corner)).toBeNull();
    expect(landOf('cornell')!.every(each => !each.stop)).toBe(true);
  });

  it('a push west finds Lexington Av, a push east finds Queensbridge, and north finds nothing', () => {
    const on = { roosevelt: 2, lex63: 1 };
    expect(wayOn(city, 'roosevelt', 'roosevelt', [-.01, 0], on)).toMatchObject({ id: 'lex63', kind: 'go' });
    expect(wayOn(city, 'roosevelt', 'roosevelt', [.01, -.004], on)).toMatchObject({ id: 'queensbridge', kind: 'empty' });
    expect(wayOn(city, 'roosevelt', 'roosevelt', [0, .01], on)).toMatchObject({ id: null, kind: 'none' });
  });
});
