import { Suspense } from "react";
import { Member } from "@/app/l/[slug]/me/member";
import type { Params, SearchParams } from "@/app/l/[slug]/tap-in";

export default function MemberPage({
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
          <Member params={params} searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}
