import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import { leadsIntoGroups } from '@/proxy';

// With LOOP_FRONT=campus the groups site opens for the admin and for the members of a group, and for nobody else (openspec
// loop-campus-rewards, specs/admin-gate, as changed by loop-on-you, design D12). This walks every page and every action of
// the current site that leads into groups, as a signed-in person who is not the admin and belongs to no group, and as a
// signed-out visitor, with a database that fails the test if it is touched: nobody gets as far as a group.
// The pages and action files are found on disk, so a page added later is walked too.

const { database } = vi.hoisted(() => ({ database: vi.fn(() => { throw new Error('Unexpected database access'); }) }));
vi.mock('@/lib/db', async original => ({ ...await original<typeof import('@/lib/db')>(), db: database }));
// The signed-in visitor here belongs to no group. (That a member of a group does get in is tested with a real database, in app/a/share-page.test.tsx.)
vi.mock('@/lib/emba/in-a-group', () => ({ inAGroup: async () => false }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); database.mockClear(); });

const APP = join(process.cwd(), 'app');
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
const under = ['groups', 'emba', 'e', 'a'].flatMap(root => files(join(APP, root)));
// An ask belongs to its group's members whichever site is in front (loop-on-you, design D12): these reach the database, where each
// service checks the caller's role in the ask's group. A signed-out visitor is still stopped before it.
const MEMBERS = ['addTeamAsk', 'answerTeamAsk', 'closeTeamAsk', 'extendTeamAsk'];
// The answer link Loop emails is the member's own: its form works for whoever holds the link, and reaches only that ask.
const LINKS = ['answerFromPersonalLink'];
const route = (file: string) => `/${relative(APP, file).split(sep).slice(0, -1).map(part => part.replace(/^\[\[?\.{0,3}(\w+)\]?\]$/, 'x')).join('/')}`;
const pages = under.filter(file => file.endsWith(`${sep}page.tsx`) && leadsIntoGroups(route(file)));
const actionFiles = under.filter(file => /actions\.ts$/.test(file));
const load = (file: string) => import(/* @vite-ignore */ `@/app/${relative(APP, file).split(sep).join('/')}`) as Promise<Record<string, unknown>>;

const member = { personId: '00000000-0000-4000-8000-000000000001', issuer: 'https://issuer.test', subject: 'user_teammate', verifiedEmail: 'teammate@cornell.edu', authenticatedAt: Date.now(), expiresAt: Date.parse('2099-01-01') } as unknown as Principal;
const props = () => ({ params: Promise.resolve({ namespace: 'team-1', slug: 'sub', id: '00000000-0000-4000-8000-000000000002', token: 'abcdefghijklmnopqrstuvwx' }), searchParams: Promise.resolve({}) });
/** What opening a page came to: where it sent the visitor, or what it drew. */
async function open(page: (props: object) => unknown) {
  try { return { drawn: await page(props()), sent: null }; } catch (error) {
    const digest = (error as { digest?: string }).digest;
    if (!digest) throw error;
    return { drawn: null, sent: digest };
  }
}
const visitors: [string, <T>(run: () => T) => T][] = [['a signed-in person who is in no group and is not the admin', run => withPortalTestSession(member, run)], ['a signed-out visitor', run => run()]];

it('finds the pages and actions of the groups site', () => {
  expect(pages.map(route)).toEqual(expect.arrayContaining(['/groups', '/groups/x', '/groups/x/in/x/team', '/groups/archive', '/groups/connections', '/emba', '/e/x']));
  expect(pages.map(route)).not.toEqual(expect.arrayContaining(['/a/x']));
  expect(pages.map(route)).not.toEqual(expect.arrayContaining(['/groups/sign-in/x']));
  expect(actionFiles.length).toBeGreaterThanOrEqual(15);
});

describe.each(visitors)('with the campus as the front door, %s', (who, as) => {
  it.each(pages.map(file => [route(file), file]))('opens %s and reaches no group', async (_route, file) => {
    vi.stubEnv('LOOP_FRONT', 'campus'); vi.stubEnv('LOOP_ADMIN', 'founder@cornell.edu');
    const page = (await load(file)).default as (props: object) => unknown;
    const { sent } = await as(() => open(page));
    // Either they were sent away (to the front door, to sign in, or told there is no such page) or the page drew its
    // signed-out face. In no case was a group read.
    if (sent) expect(sent).toMatch(/NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK/);
    expect(database).not.toHaveBeenCalled();
  });
  it.each(actionFiles.map(file => [relative(APP, file).split(sep).join('/'), file]))('is refused by every action in %s', async (_name, file) => {
    vi.stubEnv('LOOP_FRONT', 'campus'); vi.stubEnv('LOOP_ADMIN', 'founder@cornell.edu');
    const actions = Object.entries(await load(file)).filter(([, value]) => typeof value === 'function') as [string, (...args: unknown[]) => Promise<unknown>][];
    expect(actions.length).toBeGreaterThan(0);
    for (const [name, action] of actions) {
      // The stop link in an email always works: stopping messages is never closed.
      if (name === 'stopGroupMessages') continue;
      const data = new FormData(); data.set('token', 'abcdefghijklmnopqrstuvwx'); data.set('orgId', member.personId); data.set('loopId', member.personId);
      const result = await as(() => action({ status: 'idle', message: '' }, data).catch((error: { digest?: string }) => ({ status: 'error', thrown: error.digest ?? String(error) }))) as { status?: string; ok?: boolean } | undefined;
      if (LINKS.includes(name) || (MEMBERS.includes(name) && who.includes('signed-in'))) database.mockClear();
      else expect(database, name).not.toHaveBeenCalled();
      expect(result?.status === 'success' || result?.ok === true, name).toBe(false);
    }
  });
});

it('with the flag unset, the same member reaches the groups page as today', async () => {
  const page = (await load(join(APP, 'groups', 'page.tsx'))).default as () => Promise<unknown>;
  await withPortalTestSession(member, () => page().catch(() => null));
  expect(database).toHaveBeenCalled();
});
