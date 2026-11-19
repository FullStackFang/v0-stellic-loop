// @vitest-environment node
import { expect, it } from 'vitest';
import { inkBlot } from '@/lib/campus/ink-blot';

it('gives the same member the same blot, and two members different ones', () => {
  expect(inkBlot('Ben/animals/14.png')).toEqual(inkBlot('Ben/animals/14.png'));
  expect(inkBlot('Ben/animals/14.png').dark).not.toBe(inkBlot('Eve/animals/14.png').dark);
});

it('keeps the dark ink behind the whole face and the blot inside the room it is given', () => {
  const far = (path: string) => path.slice(1, -1).split('L').map(point => Math.hypot(...point.split(' ').map(Number) as [number, number]));
  for (const seed of ['Ben', 'Eve/animals/30.png', 'Stephen/animals/custom/8e68', 'You', '']) {
    const blot = inkBlot(seed), dark = far(blot.dark), school = far(blot.school);
    // The face is 100 across and drawn at 84%: the dark ink reaches past it all the way round.
    expect(Math.min(...dark)).toBeGreaterThan(36);
    // The school's ink shows outside the dark ink on average, and nothing leaves the box the blot is drawn in (80 each way).
    expect(school.reduce((sum, each) => sum + each) / school.length).toBeGreaterThan(dark.reduce((sum, each) => sum + each) / dark.length + 8);
    expect(Math.max(...school)).toBeLessThan(80);
    // The dark ink seeps a little way past its own edge, all the way round.
    const seep = far(blot.seep); for (const [at, each] of seep.entries()) { expect(each).toBeGreaterThan(dark[at] + .5); expect(each).toBeLessThan(dark[at] + 6.5); }
    expect(blot.darkDrops).toHaveLength(5); expect(blot.schoolDrops).toHaveLength(3);
  }
});
