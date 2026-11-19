// Which school an email address belongs to (design D21). A subdomain counts: stern.nyu.edu is NYU, baruch.cuny.edu is CUNY.
// No 'server-only': the sign-in card follows the email as it is typed with this same rule.

export function schoolOfEmail<T extends { domains: readonly string[] }>(schools: readonly T[], email: string | null | undefined): T | null {
  const [, domain = ''] = (email ?? '').trim().toLowerCase().split('@');
  if (!domain.includes('.')) return null;
  return schools.find(school => school.domains.some(own => domain === own || domain.endsWith(`.${own}`))) ?? null;
}

/**
 * The campus screen is the front door and the groups site opens for the admin only (design D17). That is how the site
 * runs unless LOOP_FRONT=groups is set, which puts the groups site back in front for everyone.
 */
export const frontIsCampus = () => process.env.LOOP_FRONT !== 'groups';

/**
 * A school can have more than one campus. A campus that is part of a school is named here with its school, by slug.
 * Nobody is placed at a part by their email: a person's own campus is the school's first, and a part is somewhere
 * they may look at and join things (the swap on the map).
 */
const PART_OF: Record<string, string> = { 'cornell-tech': 'cornell' };
/** The school a campus belongs to: its parent, or itself. */
export const schoolOf = (slug: string) => PART_OF[slug] ?? slug;
/** What a campus's ticket says in the swap, for the campuses of a school with more than one. */
export const SWAP_TICKET: Record<string, { title: string; line: string; mark: 'tower' | 'tram' }> = {
  cornell: { title: 'Ithaca', line: 'The hill, Collegetown, downtown', mark: 'tower' },
  'cornell-tech': { title: 'New York', line: 'Cornell Tech and Roosevelt Island', mark: 'tram' },
};

/** The campus shown to a signed-in person whose email is at none of the schools. */
export const DEFAULT_CAMPUS = 'cornell';
