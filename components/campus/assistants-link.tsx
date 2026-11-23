'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { LinkWait } from '@/components/loading/link-wait';
import { hasInkPlusAction, planHereAction } from './foot-actions';
import { InkMark } from './ink-mark';
import { InkAsk } from './join-plan';
import './foot.css';

/**
 * "Assistants" in the top bar, for someone in a group. Assistants is part of Ink+: for someone without it, pressing the
 * link opens the one ask card (InkAsk) under it, in place of going there (the pill and the card are the ones picked in
 * public/demo/mockups-foot-legal.html, where the link first stood at the foot of the page).
 *
 * `plus` is what the page already knows: the person has Ink+. The link is then a plain link from the start. Without it
 * the server is asked, and a press waited for that answer before it went anywhere, with nothing shown meanwhile.
 */
export function AssistantsLink({ plus: known = false }: { plus?: boolean } = {}) {
  const router = useRouter(), asked = useRef<Promise<boolean> | null>(known ? Promise.resolve(true) : null), [plus, setPlus] = useState(known), [ask, setAsk] = useState(false);
  // Someone on Ink is told what Ink+ adds, and what it costs in place of Ink (openspec loop-ink-tiers).
  const [onInk, setOnInk] = useState(false);
  // While a press waits for the server's answer, the link shows the small one, as every link of the bar does while its page is on its way.
  const [asking, setAsking] = useState(false);
  // Asked once, when the link is first pointed at. If it cannot be asked, the link stays a link.
  const knows = () => asked.current ??= hasInkPlusAction().catch(() => true).then(has => { setPlus(has); return has; });
  const press = async (event: React.MouseEvent<HTMLAnchorElement>) => { if (plus) return; event.preventDefault(); if (ask) return setAsk(false); setAsking(true); const has = await knows(); setAsking(false); if (has) router.push('/groups/connections'); else { setAsk(true); setOnInk((await planHereAction().catch(() => 'free')) === 'ink'); } };
  return <span className="cs-asst">
    <Link className="cs-ft-asst" href="/groups/connections" data-open={ask || undefined} onPointerEnter={knows} onFocus={knows} onClick={press} aria-label={plus ? undefined : 'Assistants, with Ink+'}><InkMark plus />Assistants<LinkWait on={asking} /></Link>
    {/* The one ask card. Signing up opens Assistants: the plan is theirs, and the link is a plain link from then on. */}
    {ask && <InkAsk plan="plus" place="assistants: Get Ink+" title="Assistants come with Ink+" onClose={() => setAsk(false)} then="Open Assistants"
      onDone={() => { asked.current = Promise.resolve(true); setPlus(true); setAsk(false); router.push('/groups/connections'); }}
      line={onInk ? 'Your own AI on your groups, and insights on them: $9.99 a month, in place of Ink’s $2.99. Your Ink stays.' : 'Your own AI on your groups: what was decided, who has what, and what is due. Insights on them come with it.'} />}
  </span>;
}
