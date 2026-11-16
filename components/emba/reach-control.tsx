import type { Way } from '@/lib/emba/reach';

/** The four ways a group may reach a member, in the words the member reads. */
export const REACH_LABEL: Record<Way, string> = {
  email: 'By email',
  assistant: 'In my assistant and on the site only',
  whatsapp: 'On WhatsApp',
  none: 'Not at all',
};

/**
 * The line and control on a join form: it states the default before the
 * person confirms, with the control to change it beside it. WhatsApp is not
 * offered here, because it needs the member's own message to Loop's number
 * first; that starts from the Reach page.
 */
export function ReachAtJoin({ email }: { email: string | null }) {
  return <>
    <p>This group will email you{email ? <> at {email}</> : ''} when it asks its members something or an organizer sends an announcement. Everything stays on the site and in your assistant whatever you choose.</p>
    <label>How this group reaches you<select name="reach" defaultValue="email">{(['email', 'assistant', 'none'] as const).map(way => <option key={way} value={way}>{REACH_LABEL[way]}</option>)}</select></label>
  </>;
}
