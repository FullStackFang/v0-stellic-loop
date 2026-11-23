import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DoorSignIn } from './door-sign-in';

// The sign-in form is Clerk's. Here it is an email field and, as where LinkedIn is switched on there, a LinkedIn button
// that carries the provider's name in its class, as Clerk's does. What the card asks of the form is kept.
const form = vi.hoisted(() => ({ props: null as null | { appearance: { elements: Record<string, Record<string, unknown>> } } }));
vi.mock('@clerk/nextjs', () => ({ SignIn: (props: never) => { form.props = props; return <><input name="identifier" aria-label="Email" /><button className="cl-socialButtonsBlockButton cl-socialButtonsBlockButton__linkedin_oidc">Continue with LinkedIn</button></>; } }));
afterEach(() => { cleanup(); form.props = null; });

const SCHOOLS = [{ slug: 'cornell', name: 'Cornell', domains: ['cornell.edu'] }, { slug: 'nyu', name: 'NYU', domains: ['nyu.edu'] }];
const type = (email: string) => fireEvent.input(screen.getByRole('textbox', { name: 'Email' }), { target: { value: email } });

describe('the sign-in card (public/demo/mockups-any-email.html)', () => {
  it('lets any email continue: a school email is spotted, any other one is told it can still sign up', () => {
    render(<DoorSignIn schools={SCHOOLS} routing="hash" configured />);
    expect(screen.getByText('Any email works.')).toBeInTheDocument();
    type('omar@gmail.com');
    expect(screen.getByText('gmail.com isn’t a school email. You can still sign up.')).toBeInTheDocument();
    // Nothing is taken away from the card for it: no mark the styles hide the other ways on by.
    expect(document.querySelector('.cs-door-in')).not.toHaveAttribute('data-away');
    type('ana@cornell.edu');
    expect(screen.getByText('cornell.edu is Cornell.')).toBeInTheDocument();
  });
  it('keeps LinkedIn off the card, even where the sign-in service has it switched on', () => {
    render(<DoorSignIn schools={SCHOOLS} routing="hash" configured />);
    expect(form.props!.appearance.elements.socialButtonsBlockButton__linkedin_oidc).toEqual({ display: 'none' });
    type('omar@gmail.com');
    expect(screen.queryByText(/LinkedIn/, { selector: 'p, span' })).toBeNull();
  });
});
