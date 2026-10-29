import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type Session = { userId: string; email: string | null };

/** Own `person` row, as readable through RLS. `first_name` is null until /welcome. */
export type Person = {
  id: string;
  campus_id: string;
  email: string;
  first_name: string | null;
};

export type NamedPerson = Person & { first_name: string };

const PERSON_COLUMNS = "id, campus_id, email, first_name";

/** Verified session from the request cookies, or null when signed out. */
export async function getSession(): Promise<Session | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return { userId: data.claims.sub, email: data.claims.email ?? null };
}

/**
 * The signed-in person's own row (RLS allows exactly that one), or null when
 * signed out. The row is created by a database trigger on sign-up, so a
 * session without a row is a configuration error, not a state to handle.
 */
export async function getPerson(): Promise<Person | null> {
  const session = await getSession();
  if (!session) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("person")
    .select(PERSON_COLUMNS)
    .eq("id", session.userId)
    .maybeSingle<Person>();
  if (error) throw error;
  if (!data) throw new Error(`No person row for signed-in user ${session.userId}`);
  return data;
}

/**
 * Gate for member and organizer pages. Redirects to `/signin` when signed out
 * and to `/welcome` while the person has no first name; both carry `next` so
 * the person returns to the page they started from.
 */
export async function requirePerson(next: string): Promise<NamedPerson> {
  const person = await getPerson();
  const back = `?next=${encodeURIComponent(safeNext(next))}`;
  if (!person) redirect(`/signin${back}`);
  if (person.first_name === null) redirect(`/welcome${back}`);
  return person as NamedPerson;
}

/** Origin of `NEXT_PUBLIC_APP_URL`, read lazily so tests can set it; null when unset or unparsable. */
function appOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return null;
  try {
    const origin = new URL(raw).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/**
 * Accepts `raw` only as a path starting with `/l/` or `/org/` on this app
 * (so no `//host`, no backslashes, no dot segments, no control characters).
 * An absolute URL is accepted only when its origin equals the origin of
 * `NEXT_PUBLIC_APP_URL`, and is reduced to its path. Anything else becomes `/`.
 */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (raw.includes("\\") || /[\u0000-\u001f\u007f\s]/.test(raw)) return "/";

  let path = raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    const origin = appOrigin();
    if (!origin) return "/";
    let absolute: URL;
    try {
      absolute = new URL(raw);
    } catch {
      return "/";
    }
    if (absolute.origin !== origin) return "/";
    path = absolute.pathname + absolute.search;
  }

  if (!/^\/(?:l|org)\//.test(path)) return "/";

  let url: URL;
  try {
    url = new URL(path, "http://loop.invalid");
  } catch {
    return "/";
  }
  if (url.origin !== "http://loop.invalid") return "/";
  if (!/^\/(?:l|org)\//.test(url.pathname)) return "/";

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return "/";
  }
  if (decodedPath.includes("\\") || decodedPath.split("/").some((s) => s === "." || s === "..")) {
    return "/";
  }

  return url.pathname + url.search;
}
