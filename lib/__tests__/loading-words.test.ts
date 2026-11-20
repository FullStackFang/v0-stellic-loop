import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

// One loader for the whole app (openspec loop-loading-seats, design D15). Anything that waits shows the ticket or the
// small one (components/loading). This reads the source and fails when a wait is written some other way.

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(each => {
  const path = `${dir}/${each.name}`;
  if (each.isDirectory()) return each.name === 'node_modules' ? [] : files(path);
  return /\.(tsx|ts|css)$/.test(each.name) && !/\.test\.tsx?$/.test(each.name) ? [path] : [];
});
const source = [...files('app'), ...files('components')].map(path => ({ path, text: readFileSync(path, 'utf8') }));
const found = (pattern: RegExp, allowed: Record<string, string> = {}) => source.filter(({ path, text }) => !(path in allowed) && pattern.test(text)).map(each => each.path);

describe('nothing waits in a way of its own', () => {
  it('no button or note says a waiting word with an ellipsis', () => {
    // "Saving…", "One moment…", "Loading sign-in…": a wait is the small one and one short word, or the ticket and its one line.
    const word = /['"`>](?:One moment|Loading|Saving|Reading|Opening|Posting|Sending|Creating|Accepting|Subscribing|Keeping|Marking|Checking|Reviewing|Finding|Drawing|Adding|Joining|Working|Uploading|Signing)[^'"`<\n]{0,30}(?:…|\.\.\.)/;
    expect(found(word, {
      // The one line itself.
      'components/loading/seats.tsx': 'LINE',
    })).toEqual([]);
  });
  it('the old skeleton and the old dot are gone', () => {
    expect(found(/lp-loading|lp-wait/)).toEqual([]);
  });
  it('no part of a page waits with nothing shown', () => {
    expect(found(/fallback=\{null\}/)).toEqual([]);
  });
  it('every section of the app has a loading file above it', () => {
    // The root one covers every page; these keep the bar while the page under it changes.
    for (const path of ['app/loading.tsx', 'app/c/loading.tsx', 'app/groups/loading.tsx']) expect(source.some(each => each.path === path), path).toBe(true);
  });
});
