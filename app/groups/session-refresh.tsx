'use client';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Drawn only while signed out. The layout is kept across navigations, so once the person has signed in it is drawn again with their menu. */
export function SessionRefresh() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  useEffect(() => { if (isSignedIn) router.refresh(); }, [isSignedIn, router]);
  return null;
}
