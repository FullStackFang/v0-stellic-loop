import { describe, expect, it } from 'vitest';
import { resolveCoordination, type CoordinationCandidate } from '@/lib/emba/coordination';

const context = { orgId: 'org', loopId: 'loop', activityId: 'activity', revision: 1 };
function candidate(personId: string, minOthers = 0, requires: string[] = []): CoordinationCandidate {
  return { ...context, personId, minOthers, requires: requires.map(personId => ({ ...context, personId })) };
}

describe('EMBA fixed-point coordination', () => {
  it('permits empty and singleton outcomes without mutating its snapshot', () => {
    expect(resolveCoordination(context, [])).toEqual([]);
    const snapshot = [candidate('a')];
    const before = structuredClone(snapshot);
    expect(resolveCoordination(context, snapshot)).toEqual(['a']);
    expect(snapshot).toEqual(before);
    expect(resolveCoordination(context, [candidate('a', 1)])).toEqual([]);
  });

  it('preserves positive cycles and cascades missing dependencies through chains', () => {
    expect(resolveCoordination(context, [candidate('b', 1, ['a']), candidate('a', 1, ['b'])])).toEqual(['a', 'b']);
    expect(resolveCoordination(context, [candidate('a', 0, ['b']), candidate('b', 0, ['c']), candidate('c', 0, ['missing'])])).toEqual([]);
    expect(resolveCoordination(context, [candidate('a', 0, ['b'])])).toEqual([]);
  });

  it('requires both the threshold and named dependencies, counting only other survivors', () => {
    expect(resolveCoordination(context, [candidate('a', 1), candidate('b', 1)])).toEqual(['a', 'b']);
    expect(resolveCoordination(context, [candidate('a', 2), candidate('b', 1)])).toEqual([]);
    expect(resolveCoordination(context, [candidate('a', 1, ['missing']), candidate('b')])).toEqual(['b']);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined])('rejects malformed threshold %s', value => {
    expect(() => resolveCoordination(context, [{ ...candidate('a'), minOthers: value }])).toThrow();
  });

  it('rejects duplicate people, duplicate dependencies, self dependencies and unsupported predicates', () => {
    for (const snapshot of [
      [candidate('a'), candidate('a')], [candidate('a', 0, ['b', 'b'])],
      [candidate('a', 0, ['a'])], [{ ...candidate('a'), capacity: 3 }],
      [{ ...candidate('a'), excludes: ['b'] }],
    ]) expect(() => resolveCoordination(context, snapshot)).toThrow();
  });

  it.each(['orgId', 'loopId', 'activityId', 'revision'])('rejects cross-context %s on candidates and dependency references', key => {
    const other = key === 'revision' ? 2 : 'other';
    expect(() => resolveCoordination(context, [{ ...candidate('a'), [key]: other }])).toThrow();
    expect(() => resolveCoordination(context, [{ ...candidate('a'), requires: [{ ...context, personId: 'b', [key]: other }] }])).toThrow();
  });

  it('rejects malformed contexts, rows, and references instead of silently weakening conditions', () => {
    for (const value of [null, {}, { ...context, revision: 0 }, { ...context, orgId: '' }]) {
      expect(() => resolveCoordination(value, [])).toThrow();
    }
    for (const value of [null, {}, [null], [candidate('')], [{ ...candidate('a'), requires: null }], [{ ...candidate('a'), requires: ['b'] }]]) {
      expect(() => resolveCoordination(context, value)).toThrow();
    }
  });

  it('is the greatest feasible subset for every three-person directed graph and threshold assignment in every input order', () => {
    const ids = ['a', 'b', 'c'];
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    // 64 directed dependency graphs x 64 threshold assignments x all 8 subsets.
    for (let graph = 0; graph < 64; graph++) {
      for (let thresholds = 0; thresholds < 64; thresholds++) {
        const rows = ids.map((id, i) => candidate(id, (thresholds >> (2 * i)) & 3,
          ids.filter(other => other !== id).filter((_, j) => graph & (1 << (2 * i + j)))));
        const feasible: string[][] = [];
        for (let mask = 0; mask < 8; mask++) {
          const subset = ids.filter((_, i) => mask & (1 << i));
          if (rows.filter(row => subset.includes(row.personId)).every(row =>
            subset.length > row.minOthers && row.requires.every(ref => subset.includes(ref.personId)))) feasible.push(subset);
        }
        // Independent oracle: the union of all feasible subsets must itself be the greatest feasible set.
        const greatest = ids.filter(id => feasible.some(subset => subset.includes(id)));
        expect(feasible).toContainEqual(greatest);
        for (const order of orders) expect(resolveCoordination(context, order.map(i => rows[i]))).toEqual(greatest);
      }
    }
  });
});
