'use client';

import { SignOutButton } from '@clerk/nextjs';

/** "Sign out". Rendered only where sign-in is set up (inside CampusShell's provider). */
export function SignOut({ className }: { className?: string }) {
  return <SignOutButton redirectUrl="/"><button className={className}>Sign out</button></SignOutButton>;
}
