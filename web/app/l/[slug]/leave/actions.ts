"use server";

import { notFound, redirect } from "next/navigation";
import { requirePerson } from "@/lib/auth";
import { getLoopBySlug, isSlug } from "@/lib/loops";
import { createAdminClient } from "@/lib/supabase/admin";
import { findMembership, leave } from "@/app/l/[slug]/membership";

/**
 * Form action of `/l/<slug>/leave`. The membership is the session's own in
 * the loop named by `slug`; any membership id in the form is ignored. Already
 * left (or never joined) lands on the tap-in page with no write; a failed
 * write returns to the confirm page with `?error=failed`.
 */
export async function confirmLeave(formData: FormData): Promise<void> {
  const slug = formData.get("slug");
  if (!isSlug(slug)) notFound();
  const person = await requirePerson(`/l/${slug}/leave`);

  const admin = createAdminClient();
  const loop = await getLoopBySlug(admin, slug);
  if (!loop) notFound();
  const membership = await findMembership(admin, loop.id, person.id);
  if (!membership || membership.left_at !== null) redirect(`/l/${slug}`);

  try {
    await leave(admin, membership);
  } catch (err) {
    console.error("confirmLeave:", err);
    redirect(`/l/${slug}/leave?error=failed`);
  }
  redirect(`/l/${slug}?left=1`);
}
