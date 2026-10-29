import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Cookie-backed Supabase client for server components and server actions.
 * Reads the session from the request cookies; writes refreshed tokens back
 * when called from a server action. Server components cannot set cookies, so
 * `proxy.ts` refreshes the session for them.
 *
 * Create one per request; never share across requests.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component, where cookies are read-only.
          // proxy.ts refreshes the session on every request instead.
        }
      },
    },
  });
}
