import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

/**
 * Secret-key client — bypasses RLS. Bot-only; never ship this key to browsers.
 * Needs Node 22+ (native WebSocket) for @supabase/supabase-js.
 */
export const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseSecretKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

export function newId(): string {
  return crypto.randomUUID();
}

export function assertOk<T>(
  data: T | null,
  error: { message: string } | null,
  context: string,
): T {
  if (error) {
    throw new Error(`[supabase:${context}] ${error.message}`);
  }
  if (data === null) {
    throw new Error(`[supabase:${context}] No data returned`);
  }
  return data;
}
