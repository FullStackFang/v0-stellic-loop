import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePerson } from "@/lib/auth";
import { getLoopBySlug, isSlug } from "@/lib/loops";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { confirmLeave } from "@/app/l/[slug]/leave/actions";

export type Params = Promise<{ slug: string }>;
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The caller's own membership, read through RLS with exactly these columns. */
type OwnMembership = { id: string; crew_id: string | null; left_at: string | null };

/**
 * Confirm step for leaving from an email footer. GET only reads: email
 * scanners prefetch footer links, so the write happens only when the form
 * posts `confirmLeave`. Reads the caller's own membership through the RLS
 * client (filtered by person) and the loop's public columns; no other member
 * is read or shown. `?error=failed` (from `confirmLeave`) shows fixed copy.
 */
export async function LeaveConfirm({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const query = await searchParams;
  const person = await requirePerson(`/l/${slug}/leave`);

  const loop = await getLoopBySlug(createAdminClient(), slug);
  if (!loop) notFound();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("membership")
    .select("id, crew_id, left_at")
    .eq("loop_id", loop.id)
    .eq("person_id", person.id)
    .maybeSingle();
  if (error) throw error;
  const membership = (data as OwnMembership | null) ?? null;
  if (!membership || membership.left_at !== null) redirect(`/l/${slug}`);

  const rawError = Array.isArray(query.error) ? query.error[0] : query.error;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{loop.title}</h1>
      {rawError === "failed" ? (
        <p role="alert" className="text-sm text-accent-strong">
          That didn&apos;t save. Try again.
        </p>
      ) : null}
      <p className="text-secondary">
        Leave {loop.title}?{" "}
        {membership.crew_id !== null ? (
          <>
            You&apos;ll leave your crew and stop getting email for this loop. If you tap back in
            later, you&apos;ll go back into the pool for a new crew.
          </>
        ) : (
          <>
            You&apos;ll stop getting email for this loop and won&apos;t be placed in a crew. You can
            tap back in later.
          </>
        )}
      </p>
      <form action={confirmLeave} className="flex flex-wrap gap-3">
        <input type="hidden" name="slug" value={slug} />
        <button type="submit" className="pls-btn pls-btn--secondary">
          Leave loop
        </button>
        <Link href={`/l/${slug}/me`} className="pls-btn pls-btn--ghost">
          Stay
        </Link>
      </form>
    </div>
  );
}
