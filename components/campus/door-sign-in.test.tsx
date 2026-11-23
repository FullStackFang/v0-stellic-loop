import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DoorSignIn } from './door-sign-in';

// The sign-in form is Clerk's. Here it is an email field and, once LinkedIn is switched on there, a LinkedIn button
// that carries the provider's name in its class, as Clerk's does.
const form = vi.hoisted(() => ({ linkedin: false }));
vi.mock('@clerk/nextjs', () => ({ SignIn: () => <><input name="identifier" aria-label="Email" />{form.linkedin && <button className="cl-socialButtonsBlockButton cl-socialButtonsBlockButton__linkedin_oidc">Continue with LinkedIn</button>}</> }));
afterEach(() => { cleanup(); form.linkedin = false; });

const SCHOOLS = [{ slug: 'cornell', name: 'Cornell', domains: ['cornell.edu'] }, { slug: 'nyu', name: 'NYU', domains: ['nyu.edu'] }];
const type = (email: string) => fireEvent.input(screen.getByRole('textbox', { name: 'Email' }), { target: { value: email } });

describe('the sign-in card and LinkedIn', () => {
  it('with LinkedIn switched on, an email at no school leaves LinkedIn as the one way on', () => {
    form.linkedin = true;
    const { container } = render(<DoorSignIn schools={SCHOOLS} routing="hash" configured />), card = container.querySelector('.cs-door-in')!;
    type('omar@gmail.com');
    expect(screen.getByText('gmail.com is not a school email. Use LinkedIn.')).toBeInTheDocument();
    expect(screen.getByText('LinkedIn gets you in.')).toBeInTheDocument();
    // The mark the styles go by: with it, every way on but LinkedIn is hidden (app/c/campus.css).
    expect(card).toHaveAttribute('data-away');
    // A school email is still spotted as before, and every way on comes back.
    type('ana@cornell.edu');
    expect(screen.getByText('cornell.edu is Cornell.')).toBeInTheDocument();
    expect(card).not.toHaveAttribute('data-away');
    type('');
    expect(screen.getByText('Your school email, or LinkedIn.')).toBeInTheDocument();
  });
  it('with no LinkedIn button, says nothing about LinkedIn', () => {
    render(<DoorSignIn schools={SCHOOLS} routing="hash" configured />);
    type('omar@gmail.com');
    expect(screen.getByText('Not an email at Cornell or NYU. You can still sign in with it.')).toBeInTheDocument();
    expect(screen.queryByText(/LinkedIn/)).toBeNull();
    expect(document.querySelector('.cs-door-in')).not.toHaveAttribute('data-away');
  });
});
