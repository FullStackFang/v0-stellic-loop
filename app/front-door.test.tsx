import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Home from './page';
import GroupsPage from './groups/page';
import SignInPage from './groups/sign-in/[[...sign-in]]/page';

afterEach(cleanup);
const sentTo = (path: string) => expect.objectContaining({ digest: expect.stringContaining(`;${path};`) });

it('opening the site goes to the groups page', () => {
  expect(() => Home()).toThrow(sentTo('/groups'));
});

it('a signed-out visitor to the groups page is sent to the one sign-in screen', async () => {
  await expect(GroupsPage()).rejects.toEqual(sentTo('/groups/sign-in'));
});

it('the sign-in screen says what Loop is and keeps the way to the trip board', () => {
  render(SignInPage());
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Stay in the loop. Without chasing it.');
  expect(screen.getByRole('link', { name: 'Open the trip board' })).toHaveAttribute('href', '/b/emba27');
  expect(screen.queryByText(/Step 1 of 3|three steps/i)).toBeNull();
});
