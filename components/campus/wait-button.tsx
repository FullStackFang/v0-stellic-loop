'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';
import { SeatsWord } from '@/components/loading/seats';

/**
 * A submit button in a server-rendered form that shows the small blot and one word while its own press is being answered
 * (openspec loop-loading-seats, design D10). A form can hold several submit buttons (the admin's animal card: Save and
 * the tier rail), so it waits only when it was the one pressed.
 */
export function WaitButton({ word, plate, children, onClick, disabled, ...button }: ComponentProps<'button'> & { word: string; plate?: boolean }) {
  const { pending } = useFormStatus();
  const [pressed, setPressed] = useState(false);
  useEffect(() => { if (!pending) setPressed(false); }, [pending]);
  const on = pending && pressed;
  return <button {...button} disabled={disabled || on} aria-busy={on || undefined} onClick={event => { setPressed(true); onClick?.(event); }}>
    <SeatsWord on={on} word={word} plate={plate}>{children}</SeatsWord>
  </button>;
}
