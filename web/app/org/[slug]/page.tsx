import { Suspense } from "react";
import { DashboardGate, type Params, type SearchParams } from "@/app/org/[slug]/dashboard";

export default function DashboardPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <main className="flex flex-1 justify-center px-4 py-10">
      <div className="flex w-full max-w-3xl flex-col gap-8">
        <Suspense fallback={null}>
          <DashboardGate params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
