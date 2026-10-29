import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Browser Supabase client (anon key, cookie session shared with the server).
 * `anon`/`authenticated` have no write grants, so this is read-only by policy.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
