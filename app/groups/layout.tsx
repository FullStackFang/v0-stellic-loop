import { ClerkProvider, UserButton } from '@clerk/nextjs';
import { db } from '@/lib/db';
import type { Principal } from '@/lib/emba/access';
import { clerkPortalConfigured } from '@/lib/emba/clerk-identity';
import { groupHandle, treeOrder } from '@/lib/emba/group-path';
import { getPortalPrincipal, portalGroupTree } from '@/lib/emba/portal-session';
import { PHOTO, animal, animalOf } from '@/lib/campus/animals';
import { hasInk } from '@/lib/campus/ink';
import { campusOf, pickedFaces } from '@/lib/campus/people';
import { Kit } from '@/components/campus/kit';
import { Bar, type BarGroup } from './bar';
import { SessionRefresh } from './session-refresh';
import '@/app/c/campus.css';
import './campus-look.css';

// The bar names the groups the signed-in person can open. A failure here must not take the page down: each page reports its own access.
async function barGroups(principal: Principal): Promise<BarGroup[]> {
  try {
    return treeOrder(await portalGroupTree(principal)).map(group => ({ id: group.loopId, parent: group.parentLoopId, namespace: group.namespace, slug: group.slug, name: group.orgName, handle: groupHandle(group), depth: group.depth }));
  } catch { return []; }
}
/** Whose colours the person sees unless they pick others (their school's, or Loop's own), and the animal that is their face. */
async function looks(principal: Principal): Promise<{ kit: string; face: string | null; ink: boolean }> {
  try {
    const [school, [faces, ink]] = await Promise.all([campusOf(db(), principal), db().tx(async q => [await pickedFaces(q, [principal.personId]), await hasInk(q, principal.personId)] as const)]);
    const picked = faces.get(principal.personId);
    return { kit: school?.slug ?? 'loop', face: picked === PHOTO ? null : animal(picked ?? animalOf(principal.personId)), ink };
  } catch { return { kit: 'loop', face: null, ink: false }; }
}
// Runs before the page is painted, so a picked or school kit never flashes in after the default. The key is the one components/campus/kit.tsx uses.
const kitScript = (own: string) => `try{document.documentElement.dataset.kit=localStorage.getItem('loop-kit')||${JSON.stringify(own).replace(/</g, '\\u003c')}}catch(e){}`;

export default async function GroupsLayout({ children }: { children: React.ReactNode }) {
  const configured = clerkPortalConfigured();
  const principal = await getPortalPrincipal().catch(() => null);
  // Signed out there is no bar: the page itself carries the way in, in the look it always had.
  let content = <div className="lp">{configured && <SessionRefresh />}<main className="lp-main lp-main-out"><div className="lp-wrap">{children}</div></main></div>;
  if (principal) {
    const [groups, look] = await Promise.all([barGroups(principal), looks(principal)]);
    content = <div className="cs gb"><script dangerouslySetInnerHTML={{ __html: kitScript(look.kit) }} /><Kit own={look.kit} />
      <Bar groups={groups} face={look.face} ink={look.ink} account={configured ? <UserButton showName /> : null} />
      <div className="lp"><main className="lp-main"><div className="lp-wrap">{children}</div></main></div></div>;
  }
  return configured ? <ClerkProvider signInUrl="/groups/sign-in" signInFallbackRedirectUrl="/groups" signUpFallbackRedirectUrl="/groups" telemetry={{ disabled: true }}>{content}</ClerkProvider> : content;
}
