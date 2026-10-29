import { safeNext } from "@/lib/auth";
import { ConfirmForm } from "@/app/auth/confirm/confirm-form";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Reads `token_hash`, `type`, and `next` from the link and renders the Continue
 * form. Rendering never touches Supabase: the token is consumed only by the
 * form's server action.
 */
export async function ConfirmGate({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const type = first(params.type);
  const tokenHash = type === null || type === "email" ? first(params.token_hash) : null;
  return <ConfirmForm tokenHash={tokenHash} next={safeNext(first(params.next))} />;
}
