import { Suspense } from "react";
import { safeNext } from "@/lib/auth";
import { SignInForm } from "@/app/signin/signin-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <section className="pls-raised flex w-full max-w-sm flex-col gap-6 p-8">
        <Suspense fallback={null}>
          <SignIn searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}

async function SignIn({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  return <SignInForm next={safeNext(next)} />;
}
