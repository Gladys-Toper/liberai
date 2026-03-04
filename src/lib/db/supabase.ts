import { createBrowserClient as createBrowser } from "@supabase/ssr";
import { createServerClient as createServer } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Check if Supabase is configured with required environment variables.
 * Returns false if either URL or anon key is missing.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Create a Supabase client for use in the browser.
 * Returns null if Supabase is not configured, allowing graceful fallback to mock data.
 */
export function createBrowserSupabaseClient() {
  if (!isSupabaseConfigured()) {
    console.warn("[LiberAi] Supabase not configured — using mock data");
    return null;
  }

  return createBrowser(supabaseUrl!, supabaseAnonKey!);
}

/**
 * Create a Supabase client for use on the server (Next.js App Router with cookies).
 * This is used in server components and route handlers.
 * Returns null if Supabase is not configured.
 */
export async function createServerSupabaseClient() {
  if (!isSupabaseConfigured()) {
    console.warn("[LiberAi] Supabase not configured — using mock data");
    return null;
  }

  const cookieStore = await cookies();

  return createServer(
    supabaseUrl!,
    supabaseAnonKey!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Get the Supabase URL for use in client-side API requests.
 * Requires Supabase to be configured.
 */
export function getSupabaseUrl(): string | null {
  return supabaseUrl || null;
}

/**
 * Get the Supabase anon key for use in client-side API requests.
 * Requires Supabase to be configured.
 */
export function getSupabaseAnonKey(): string | null {
  return supabaseAnonKey || null;
}

/**
 * Utility function to log authentication status for debugging.
 */
export function logSupabaseStatus(): void {
  if (isSupabaseConfigured()) {
    console.log("[LiberAi] Supabase is configured and ready");
  } else {
    console.log(
      "[LiberAi] Supabase is not configured. Using mock data for development."
    );
    if (!supabaseUrl) {
      console.warn("  Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
    }
    if (!supabaseAnonKey) {
      console.warn("  Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable");
    }
  }
}
