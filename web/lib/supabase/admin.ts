import "server-only";
import { createClient } from "@supabase/supabase-js";
import { required, supabaseUrl } from "@/lib/supabase/env";

/**
 * Service-role client. Bypasses RLS, so it is used only in server code after
 * the caller has checked the session (and ownership where relevant). It must
 * never be imported from a client component.
 */
export function createAdminClient() {
  return createClient(
    supabaseUrl(),
    required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
