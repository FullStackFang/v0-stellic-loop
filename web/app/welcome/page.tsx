import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getPerson, safeNext } from "@/lib/auth";
import { WelcomeForm } from "@/app/welcome/welcome-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function WelcomePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <section className="pls-raised flex w-full max-w-sm flex-col gap-6 p-8">
        <Suspense fallback={null}>
          <Welcome searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}

async function Welcome({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNext((await searchParams).next);
  const person = await getPerson();
  if (!person) redirect(`/signin?next=${encodeURIComponent(next)}`);
  if (person.first_name !== null) redirect(next);
  return <WelcomeForm next={next} />;
}
