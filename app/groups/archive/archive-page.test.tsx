import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Principal } from '@/lib/emba/access';
import { withPortalTestSession } from '@/lib/emba/portal-session';
import ArchivePage from './page';

afterEach(cleanup);
const someone = { personId: 'p1' } as unknown as Principal;

it('shows a signed-out visitor only the way to sign in', async () => {
  render(await ArchivePage());
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/groups/sign-in?redirect_url=%2Fgroups%2Farchive');
  expect(document.querySelector('a[href^="/demo/"]')).toBeNull();
  expect(screen.queryByText(/What turned us/)).toBeNull();
});

it('tells the story newest first, and every file it links to exists', async () => {
  render(await withPortalTestSession(someone, () => ArchivePage()));
  const titles = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
  expect(titles).toHaveLength(4);
  expect(titles[0]).toMatch(/A layer between your AI and your groups/);
  expect(titles[3]).toMatch(/Campus Loop/);
  expect(screen.getAllByText(/What turned us/)).toHaveLength(3);
  const files = [...new Set([...document.querySelectorAll('a[href^="/demo/"]')].map(a => a.getAttribute('href')!))];
  expect(files.length).toBeGreaterThan(55);
  expect(files.filter(href => !existsSync(join(process.cwd(), 'public', href)))).toEqual([]);
});
