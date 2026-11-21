'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { SeatsWord } from '@/components/loading/seats';
import type { JoinPlace } from '@/lib/campus/ink';

/**
 * Signs the person up for Ink or Ink+ from where they are (openspec loop-ink-tiers, "Every ask signs you up"): one
 * press, the account's email, and the place recorded (app/c/ink/join). Someone signed out is sent to sign in and back.
 */
export async function joinPlan(plan: 'ink' | 'plus', place: JoinPlace): Promise<{ said: string } | { message: string } | null> {
  const answer = await fetch('/c/ink/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan, place, back: location.pathname + location.search }) }).catch(() => null);
  const got = await answer?.json().catch(() => null) as { ok?: boolean; said?: string; signIn?: string; message?: string } | null;
  if (got?.signIn) { location.assign(got.signIn); return null; }
  return got?.ok && got.said ? { said: got.said } : { message: got?.message ?? 'That did not go through. Try again.' };
}

/**
 * The sign-up button of an ask. Once pressed it gives way to the thanks every sign-up says, and "Done", which shows the
 * page again with the plan they now have.
 */
export function JoinPlan({ plan, place, className = 'cs-btn sm go', children }: { plan: 'ink' | 'plus'; place: JoinPlace; className?: string; children: ReactNode }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [said, setSaid] = useState(''), [wrong, setWrong] = useState('');
  if (said) return <span className="cs-joined" role="status"><span>{said}</span><button type="button" className="cs-btn sm" onClick={() => router.refresh()}>Done</button></span>;
  return <>
    <button type="button" className={className} disabled={busy} onClick={async () => {
      setBusy(true); setWrong('');
      const got = await joinPlan(plan, place);
      setBusy(false);
      if (got && 'said' in got) setSaid(got.said); else if (got) setWrong(got.message);
    }}><SeatsWord on={busy} word="Signing up" plate>{children}</SeatsWord></button>
    {wrong && <p role="alert">{wrong}</p>}
  </>;
}
