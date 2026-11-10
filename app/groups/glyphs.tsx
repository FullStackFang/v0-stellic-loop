import { assistantName } from '@/lib/emba/team-text';

// Small marks shared by the /groups pages. Each assistant has its own shape, always followed by its name, so who saved a record never rests on colour.

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const Arrow = () => <svg viewBox="0 0 12 12" aria-hidden="true" {...stroke}><path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" /></svg>;
export const Alert = () => <svg viewBox="0 0 12 12" aria-hidden="true" {...stroke} strokeWidth={1.4}><circle cx="6" cy="6" r="4.6" /><path d="M6 3.6v2.9M6 8.3v.1" /></svg>;

/** The three interlocking rings on the wordmark and the team plate. */
export const Rings = ({ className }: { className?: string }) => <svg className={className} viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="6">
  <circle cx="50" cy="34" r="22" /><circle cx="34" cy="62" r="22" /><circle cx="66" cy="62" r="22" />
</svg>;

const shapes = {
  claude: <path d="M6 1v10M1 6h10M2.5 2.5l7 7M9.5 2.5l-7 7" {...stroke} strokeWidth={1.5} />,
  chatgpt: <circle cx="6" cy="6" r="3.8" {...stroke} strokeWidth={2} />,
  cursor: <path d="M2.5 1.5 10 6 6.4 7 4.6 10.5Z" fill="currentColor" />,
  other: <><circle cx="6" cy="6" r="4.2" {...stroke} strokeWidth={1.5} /><circle cx="6" cy="6" r="1.4" fill="currentColor" /></>,
  site: <rect x="2.5" y="2.5" width="7" height="7" rx="1.2" fill="currentColor" />,
};
function kindOf(name: string): keyof typeof shapes {
  const lower = name.toLowerCase();
  return lower.includes('claude') ? 'claude' : /chatgpt|openai/.test(lower) ? 'chatgpt' : lower.includes('cursor') ? 'cursor' : 'other';
}

/** Which assistant saved something, or that it was saved on the site. `clientId` is the stored client id, or null for the site. */
export function Via({ clientId, verb = 'via' }: { clientId: string | null; verb?: 'via' | 'saved by' }) {
  const name = clientId ? assistantName(clientId) : null;
  const kind = name ? kindOf(name) : 'site';
  return <span className={`lp-via lp-via-${kind}`}><svg viewBox="0 0 12 12" aria-hidden="true">{shapes[kind]}</svg>{name ? `${verb} ${name}` : 'saved on this site'}</span>;
}
