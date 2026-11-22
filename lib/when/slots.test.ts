import { describe, expect, it } from 'vitest';
import { bestSlots, needed, readiness, shiftWeek, sizeOf, slotLabel, slotsOf, validZone } from './slots';

const NY = 'America/New_York';
describe('needed', () => {
  it.each([['majority', 7, 4], ['majority', 4, 3], ['two_thirds', 7, 5], ['two_thirds', 6, 4], ['everyone', 7, 7], ['majority', 1, 1]] as const)('%s of %i is %i', (t, n, want) => expect(needed(t, n)).toBe(want));
});
it('size is the larger of expected and answered', () => { expect(sizeOf(7, 4)).toBe(7); expect(sizeOf(3, 5)).toBe(5); });
describe('slotsOf', () => {
  it('draws each hour of each day in the poll zone', () => {
    const s = slotsOf({ startDate: '2026-11-30', endDate: '2026-12-01', hourStart: 17, hourEnd: 19, timezone: NY });
    expect(s.map(x => x.at)).toEqual(['2026-11-30T22:00:00.000Z', '2026-11-30T23:00:00.000Z', '2026-12-01T22:00:00.000Z', '2026-12-01T23:00:00.000Z']);
    expect(s[0]).toMatchObject({ day: '2026-11-30', hour: 17 });
  });
  it('leaves out the hour that does not exist when clocks go forward', () => {
    const s = slotsOf({ startDate: '2027-03-14', endDate: '2027-03-14', hourStart: 1, hourEnd: 4, timezone: NY });
    expect(s.map(x => [x.hour, x.at])).toEqual([[1, '2027-03-14T06:00:00.000Z'], [3, '2027-03-14T07:00:00.000Z']]);
  });
  it('draws the repeated hour once when clocks go back', () => {
    const s = slotsOf({ startDate: '2026-11-01', endDate: '2026-11-01', hourStart: 0, hourEnd: 3, timezone: NY });
    expect(s.map(x => [x.hour, x.at])).toEqual([[0, '2026-11-01T04:00:00.000Z'], [1, '2026-11-01T05:00:00.000Z'], [2, '2026-11-01T07:00:00.000Z']]);
  });
});
describe('bestSlots', () => {
  const a = '2026-12-01T23:00:00.000Z', b = '2026-12-02T00:00:00.000Z', c = '2026-12-03T00:00:00.000Z';
  const answers = [{ personId: 'p1', slots: [a, b] }, { personId: 'p2', slots: [b, c] }, { personId: 'p3', slots: [c, b] }, { personId: 'p4', slots: [] }];
  it('orders by people, ties to the earliest', () => expect(bestSlots(answers).map(x => [x.at, x.people.length])).toEqual([[b, 3], [c, 2], [a, 1]]));
  it('keeps to the limit and names the people', () => expect(bestSlots(answers, 1)).toEqual([{ at: b, people: ['p1', 'p2', 'p3'] }]));
  it('is empty when nobody picked anything', () => expect(bestSlots([{ personId: 'p4', slots: [] }])).toEqual([]));
});
describe('readiness', () => {
  const at = '2026-12-01T23:00:00.000Z', deadline = new Date('2026-11-27T23:00:00Z'), before = new Date('2026-11-25T00:00:00Z'), after = new Date('2026-11-28T00:00:00Z');
  const three = ['p1', 'p2', 'p3'].map(personId => ({ personId, slots: [at] }));
  it('is ready early when three answered and the threshold is met', () => expect(readiness({ threshold: 'majority', expectedSize: 4, answers: three, deadline, now: before })).toEqual({ ready: true, met: true }));
  it('is never ready early with two answers', () => expect(readiness({ threshold: 'majority', expectedSize: 2, answers: three.slice(0, 2), deadline, now: before })).toEqual({ ready: false, met: true }));
  it('waits when the threshold is not met', () => expect(readiness({ threshold: 'everyone', expectedSize: 7, answers: three, deadline, now: before })).toEqual({ ready: false, met: false }));
  it('is ready at the deadline with one answer, met or not', () => expect(readiness({ threshold: 'everyone', expectedSize: 7, answers: three.slice(0, 1), deadline, now: after })).toEqual({ ready: true, met: false }));
  it('is not ready at the deadline with no answers', () => expect(readiness({ threshold: 'majority', expectedSize: 7, answers: [], deadline, now: after })).toEqual({ ready: false, met: false }));
});
it('moves a time seven days on by the local clock, across a clock change', () => expect(shiftWeek('2027-03-09T00:00:00.000Z', NY)).toBe('2027-03-15T23:00:00.000Z'));
it('labels a time in the poll zone', () => expect(slotLabel('2026-12-02T00:00:00.000Z', NY)).toEqual({ day: '2026-12-01', dow: 'Tue', dowLong: 'Tuesday', date: 1, month: 'Dec', time: '7 pm' }));
it('knows a real zone from a made-up one', () => { expect(validZone(NY)).toBe(true); expect(validZone('Mars/Olympus')).toBe(false); expect(validZone('')).toBe(false); });
