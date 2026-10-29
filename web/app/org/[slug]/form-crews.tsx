import { FormCrewsForm } from "@/app/org/[slug]/form-crews-form";

/**
 * Dashboard "Form crews" section. Renders only the waiting count and the
 * "Form crews" button; the preview (and its hash) is computed on press by
 * `previewFormCrews`, so no stale hash is ever rendered at page load.
 */
export function FormCrews({ slug, waiting }: { slug: string; waiting: number }) {
  return (
    <section aria-labelledby="form-crews-heading" className="pls-raised flex flex-col gap-4 p-6">
      <h2 id="form-crews-heading" className="pls-display text-2xl font-bold leading-tight">
        Form crews
      </h2>
      <FormCrewsForm slug={slug} waiting={waiting} />
    </section>
  );
}
