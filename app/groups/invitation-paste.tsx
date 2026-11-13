'use client';

import { useActionState, useState } from 'react';
import type { PortalResult } from '@/components/emba/portal-types';
import { Arrow } from '@/components/LoopGlyphs';
import { acceptInvite } from './actions';
import { useFragmentToken } from './fragment-token';

const initial: PortalResult = { status: 'idle', message: '' };

/** The token in a pasted invitation link (/groups#invite=…), or null when it isn't one. */
export function tokenFrom(text: string) {
  const at = text.indexOf('#');
  const token = at < 0 ? null : new URLSearchParams(text.slice(at + 1)).get('invite')?.trim();
  return token && /^[A-Za-z0-9_-]{22}$/.test(token) ? token : null;
}

/** Paste an invitation link and accept it. Arriving with #invite= in the URL fills it in. */
export function InvitationPaste() {
  const arrived = useFragmentToken('invite');
  const [text, setText] = useState<string | null>(null);
  const token = text === null ? arrived : tokenFrom(text);
  const [state, submit, pending] = useActionState(acceptInvite, initial);
  return <form action={submit} className="lp-paste">
    <div>
      <input aria-label="Invitation link" placeholder="Paste your invitation link" value={text ?? (arrived ? `/groups#invite=${arrived}` : '')} onChange={event => setText(event.target.value)} />
      <input type="hidden" name="token" value={token ?? ''} />
      <button type="submit" disabled={!token || pending}>{pending ? 'Accepting…' : 'Accept'}<Arrow /></button>
    </div>
    {state.message && <p role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
  </form>;
}
