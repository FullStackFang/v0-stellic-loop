'use client';

import type { ReactNode } from 'react';
import { SignOutButton } from '@clerk/nextjs';

/** "Sign out", or whatever `children` say, and on to the front page. Rendered only where sign-in is set up (inside CampusShell's provider). */
export function SignOut({ className, children = 'Sign out' }: { className?: string; children?: ReactNode }) {
  return <SignOutButton redirectUrl="/"><button className={className}>{children}</button></SignOutButton>;
}
