"use client";
import { useSyncExternalStore } from "react";

// Proposals this viewer just locked. The lock action refreshes the session
// cookie, which re-renders the route straight into the ON state; the card
// reads this to show the confirmation line there for a moment.
const SHOW_MS = 4000;
const locked = new Map<string, number>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function markLocked(id: string) {
  locked.set(id, Date.now());
  emit();
  setTimeout(() => {
    locked.delete(id);
    emit();
  }, SHOW_MS);
}

export function useJustLocked(id: string): boolean {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => locked.has(id),
    () => false,
  );
}
