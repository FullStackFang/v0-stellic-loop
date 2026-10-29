import { Suspense } from "react";
import { ConfirmGate, type SearchParams } from "@/app/auth/confirm/confirm-gate";

export default function ConfirmPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <section className="pls-raised flex w-full max-w-sm flex-col gap-6 p-8">
        <Suspense fallback={null}>
          <ConfirmGate searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}
