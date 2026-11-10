import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMockDb } from "./demo/mock";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();

/** True when no Supabase project is configured: the app runs on the in-browser demo backend. */
export const isDemo = !(url && key);

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (isDemo) return getMockDb() as unknown as SupabaseClient;
  if (!client) {
    client = createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

export function resetDemoData() {
  if (isDemo) getMockDb().reset();
}
