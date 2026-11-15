import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

export interface SupabaseEnvCheck {
  configured: boolean;
  url: string | null;
  publishableKey: string | null;
  reason?: string;
}

const PLACEHOLDER_MARKERS = ['placeholder', 'your-supabase', 'your-project-ref', 'example.com'];

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function containsPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Validates public Supabase browser environment variables.
 * Prefers `VITE_SUPABASE_PUBLISHABLE_KEY` and falls back to `VITE_SUPABASE_ANON_KEY`
 * for backward compatibility with existing local configurations.
 */
export function validateSupabaseEnv(env: {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}): SupabaseEnvCheck {
  const rawUrl = env.VITE_SUPABASE_URL?.trim();
  const rawKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!rawUrl || !rawKey) {
    return {
      configured: false,
      url: null,
      publishableKey: null,
      reason: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.',
    };
  }

  if (!isValidHttpUrl(rawUrl) || containsPlaceholder(rawUrl)) {
    return {
      configured: false,
      url: null,
      publishableKey: null,
      reason: 'VITE_SUPABASE_URL is invalid or still uses a placeholder value.',
    };
  }

  if (rawKey.length < 16 || containsPlaceholder(rawKey)) {
    return {
      configured: false,
      url: null,
      publishableKey: null,
      reason: 'VITE_SUPABASE_PUBLISHABLE_KEY is invalid or still uses a placeholder value.',
    };
  }

  return {
    configured: true,
    url: rawUrl,
    publishableKey: rawKey,
  };
}

export function createSupabaseClientFromEnv(env: {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}): {
  configured: boolean;
  client: SupabaseClient<Database> | null;
  reason?: string;
} {
  const check = validateSupabaseEnv(env);
  if (!check.configured || !check.url || !check.publishableKey) {
    return {
      configured: false,
      client: null,
      reason: check.reason,
    };
  }

  return {
    configured: true,
    client: createClient<Database>(check.url, check.publishableKey),
  };
}

const resolved = createSupabaseClientFromEnv({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
});

export const isSupabaseConfigured = resolved.configured;
export const supabaseConfigReason = resolved.reason;
export const supabaseClient: SupabaseClient<Database> | null = resolved.client;
