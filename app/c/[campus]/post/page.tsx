import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Rings } from '@/components/LoopGlyphs';
import { PlanForm, type PlanDraft } from '@/components/campus/plan-form';
import { db } from '@/lib/db';
import { findCampus } from '@/lib/campus/listings';
import { DAYS_AHEAD, editablePlan } from '@/lib/campus/plans';
import { campusViewer, mayUse, signInHref } from '@/lib/campus/session';
import { localParts } from '@/lib/campus/time';

export const dynamic = 'force-dynamic';

/** An instant as the form's local time on the campus's clock: 'YYYY-MM-DDTHH:mm'. */
const local = (tz: string, at: Date) => { const parts = localParts(tz, at); return `${parts.date}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`; };

/** "Post a plan", and with ?plan= the same form to change or cancel one's own plan until it starts. */
export default async function PostPlanPage({ params, searchParams }: { params: Promise<{ campus: string }>; searchParams: Promise<{ plan?: string }> }) {
  const { campus: slug } = await params, { plan: planId } = await searchParams, campus = await findCampus(db(), slug);
  if (!campus) notFound();
  const here = `/c/${campus.slug}/post${planId ? `?plan=${encodeURIComponent(planId)}` : ''}`, viewer = await campusViewer();
  if (!viewer) redirect(signInHref(here));
  if (!mayUse(viewer, campus)) redirect(viewer.campus ? `/c/${viewer.campus.slug}` : `/c/${campus.slug}`);
  let draft: PlanDraft | undefined;
  if (planId) {
    const plan = /^[0-9a-f-]{36}$/i.test(planId) ? await editablePlan(db(), { personId: viewer.personId, admin: viewer.admin }, planId) : null;
    if (!plan || plan.campusId !== campus.id) notFound();
    draft = { id: plan.id, title: plan.title, starts: local(campus.tz, new Date(plan.startsAt)), ends: plan.endsAt ? local(campus.tz, new Date(plan.endsAt)) : '', place: plan.placeText ?? '', about: plan.about ?? '' };
  }
  const now = new Date();
  return <div className="cs">
    <header className="cs-nav"><Link className="cs-wm" href={`/c/${campus.slug}`}><Rings />Loop</Link><nav className="cs-links"><Link href={`/c/${campus.slug}`}>This week</Link><Link href={here} aria-current="page">{draft ? 'Change a plan' : 'Post a plan'}</Link></nav></header>
    <main className="cs-plain">
      <h1>{draft ? 'Change your plan' : 'Post a plan'}</h1>
      <p>{draft ? 'You can change or cancel it until it starts.' : `Something you are doing in the next ${DAYS_AHEAD} days that others could join: a run, a study group, dinner.`}</p>
      <PlanForm campus={{ slug: campus.slug, name: campus.name }} earliest={local(campus.tz, now)} latest={local(campus.tz, new Date(now.getTime() + DAYS_AHEAD * 86400000))} plan={draft} />
    </main>
  </div>;
}
