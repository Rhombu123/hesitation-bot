import postgres from "postgres";
import { config } from "../config.js";

export { newId } from "./supabase.js";

/**
 * Direct Postgres pool to Supabase (bypasses PostgREST HTTP).
 * Uses transaction pooler — `prepare: false` is required for PgBouncer.
 */
export const sql = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 15,
  prepare: false,
  ssl: "require",
});

export async function pingPostgres(): Promise<void> {
  await sql`select 1`;
}

export async function closePostgres(): Promise<void> {
  await sql.end({ timeout: 5 });
}
