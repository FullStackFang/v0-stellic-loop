import { render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

let path = '/';
vi.mock('next/navigation', () => ({ usePathname: () => path }));
const { SiteNav } = await import('../SiteNav');

afterEach(() => { document.body.innerHTML = ''; });

it('hides the demo menu on the team product and keeps it on the demo space', () => {
  for (const hidden of ['/groups', '/groups/connections', '/groups/emba-team/team', '/emba', '/emba/sign-in']) {
    path = hidden;
    const { container, unmount } = render(<SiteNav />);
    expect(container.querySelector('nav.sitenav'), hidden).toBeNull();
    unmount();
  }
  path = '/b/emba27';
  const { container } = render(<SiteNav />);
  expect(container.querySelector('a[href="/demo/stellic"]')).not.toBeNull();
});
