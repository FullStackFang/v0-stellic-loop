import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { Legal } from './Legal';

// openspec/changes/loop-lighter-pages, D3: Terms and Privacy are built once, the same for everyone. So the page asks
// nothing about who is looking, and has no sign-in provider, even where sign-in is set up.
const asked = vi.hoisted(() => ({ viewer: 0 }));
vi.mock('@/lib/campus/session', () => ({ campusViewer: async () => { asked.viewer++; return null; } }));
vi.mock('@/lib/emba/clerk-identity', () => ({ clerkPortalConfigured: () => true }));
vi.mock('@clerk/nextjs', () => ({ ClerkProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="sign-in-provider">{children}</div> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/terms' }));
afterEach(() => { cleanup(); localStorage.clear(); delete document.documentElement.dataset.kit; });

const page = <Legal title="Terms" updated="November 12, 2026" gist="What you agree to." parts={[{ id: 'pilot', name: 'The pilot', short: 'A pilot.', full: <>Invitation only.</> }]} />;

it('asks nothing about who is looking and has no sign-in provider', () => {
  render(page);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Terms');
  expect(asked.viewer).toBe(0);
  expect(screen.queryByTestId('sign-in-provider')).toBeNull();
});

it('wears the colours this browser last wore when nothing was picked, as the campus pages left them', () => {
  localStorage.setItem('loop-kit-worn', 'cornell');
  render(page);
  expect(document.documentElement.dataset.kit).toBe('cornell');
  // Before the first paint too: the server draws the script that does the same.
  expect(renderToString(page)).toContain("localStorage.getItem('loop-kit-worn')");
});
