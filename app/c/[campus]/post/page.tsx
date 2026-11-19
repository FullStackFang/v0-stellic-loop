import { notFound, redirect } from 'next/navigation';
import { PlanForm, type PlanDraft } from '@/components/campus/plan-form';
import { db } from '@/lib/db';
import { findCampus } from '@/lib/campus/listings';
import { DAYS_AHEAD, editablePlan } from '@/lib/campus/plans';
import { campusViewer, mayUse, signInHref } from '@/lib/campus/session';
import { localInput as local } from '@/lib/campus/time';
import { siteBar } from '../../site-bar';

export const dynamic = 'force-dynamic';

/** With ?plan=, a form to change or cancel one's own plan until it starts. Posting a new plan is the "+" on This week (design D13). */
export default async function PostPlanPage({ params, searchParams }: { params: Promise<{ campus: string }>; searchParams: Promise<{ plan?: string }> }) {
  const { campus: slug } = await params, { plan: planId } = await searchParams, campus = await findCampus(db(), slug);
  if (!campus) notFound();
  if (!planId) redirect(`/c/${campus.slug}`);
  const here = `/c/${campus.slug}/post?plan=${encodeURIComponent(planId)}`, viewer = await campusViewer();
  if (!viewer) redirect(signInHref(here));
  if (!mayUse(viewer, campus)) redirect(viewer.campus ? `/c/${viewer.campus.slug}` : `/c/${campus.slug}`);
  const plan = /^[0-9a-f-]{36}$/i.test(planId) ? await editablePlan(db(), { personId: viewer.personId, admin: viewer.admin }, planId) : null;
  if (!plan || plan.campusId !== campus.id) notFound();
  const draft: PlanDraft = { id: plan.id, title: plan.title, starts: local(campus.tz, new Date(plan.startsAt)), ends: plan.endsAt ? local(campus.tz, new Date(plan.endsAt)) : '', place: plan.placeText ?? '', about: plan.about ?? '' };
  const now = new Date(), { bar, foot } = await siteBar({ campus, viewer, back: here });
  return <div className="cs">
    {bar}
    <main className="cs-plain">
      <h1>Change your plan</h1>
      <p>You can change or cancel it until it starts.</p>
      <PlanForm campus={{ slug: campus.slug, name: campus.name }} earliest={local(campus.tz, now)} latest={local(campus.tz, new Date(now.getTime() + DAYS_AHEAD * 86400000))} plan={draft} />
    </main>
    {foot}
  </div>;
}
