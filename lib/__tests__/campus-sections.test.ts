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
