// Which school an email address belongs to (design D21). A subdomain counts: stern.nyu.edu is NYU, baruch.cuny.edu is CUNY.
// No 'server-only': the sign-in card follows the email as it is typed with this same rule.

export function schoolOfEmail<T extends { domains: readonly string[] }>(schools: readonly T[], email: string | null | undefined): T | null {
  const [, domain = ''] = (email ?? '').trim().toLowerCase().split('@');
  if (!domain.includes('.')) return null;
  return schools.find(school => school.domains.some(own => domain === own || domain.endsWith(`.${own}`))) ?? null;
}

/** With LOOP_FRONT=campus the campus screen is the front door and the groups site opens for the admin only (design D17). */
export const frontIsCampus = () => process.env.LOOP_FRONT === 'campus';
