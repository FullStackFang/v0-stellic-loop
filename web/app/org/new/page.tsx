import { Suspense } from "react";
import { NewLoopGate } from "@/app/org/new/new-loop-gate";

export default function NewLoopPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <section className="pls-raised flex w-full max-w-md flex-col gap-6 p-8">
        <Suspense fallback={null}>
          <NewLoopGate />
        </Suspense>
      </section>
    </main>
  );
}
