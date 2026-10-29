import { Suspense } from "react";
import { LeaveConfirm, type Params, type SearchParams } from "@/app/l/[slug]/leave/leave-confirm";

/** `/l/<slug>/leave`: the signed-in confirm page every app-sent email footer links to. */
export default function LeavePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <section className="pls-raised flex w-full max-w-sm flex-col gap-6 p-8">
        <Suspense fallback={null}>
          <LeaveConfirm params={params} searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}
