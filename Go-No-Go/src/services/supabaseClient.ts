import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLIC_CONFIG } from '../config/supabasePublicConfig';
import type { Database } from '../types/database.types';

export interface SupabaseEnvCheck {
  configured: boolean;
  url: string | null;
  publishableKey: string | null;
  reason?: string;
}

export interface SupabaseDiagnostics {
  configured: boolean;
  clientInitialized: boolean;
  hasUrl: boolean;
  hasPublishableKey: boolean;
  keyKind: 'publishable' | 'anon-jwt' | 'missing' | 'invalid-secret' | 'invalid';
  reason?: string;
}

export interface SupabaseConfigInput {
  url?: string;
  publishableKey?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
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

function isSecretOrServiceRoleKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.startsWith('sb_secret_') || lower.includes('service_role');
}

function extractRawConfig(input: SupabaseConfigInput): { rawUrl: string; rawKey: string } {
  const rawUrl = (input.url ?? input.VITE_SUPABASE_URL)?.trim() ?? '';
  const rawKey =
    input.publishableKey?.trim() ||
    input.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    input.VITE_SUPABASE_ANON_KEY?.trim() ||
    '';
  return { rawUrl, rawKey };
}

/**
 * Validates public Supabase browser configuration.
 * Rejects missing, placeholder, malformed, or secret/service-role credentials.
 */
export function validateSupabaseEnv(input: SupabaseConfigInput): SupabaseEnvCheck {
  const { rawUrl, rawKey } = extractRawConfig(input);

  if (!rawUrl || !rawKey) {
    return {
      configured: false,
      url: null,
      publishableKey: null,
      reason: 'Public Supabase URL or publishable key is missing.',
    };
  }

  if (!isValidHttpUrl(rawUrl) || containsPlaceholder(rawUrl)) {
    return {
      configured: false,
      url: null,
      publishableKey: null,
      reason: 'Public Supabase URL is invalid or still uses a placeholder value.',
    };
  }

  if (isSecretOrServiceRoleKey(rawKey)) {
    return {
      configured: false,
      url: null,
      publishableKey: null,
      reason: 'Secret or service-role keys must never be used in browser-facing configuration.',
    };
  }

  if (rawKey.length < 16 || containsPlaceholder(rawKey)) {
    return {
      configured: false,
      url: null,
      publishableKey: null,
      reason: 'Public Supabase publishable key is invalid or still uses a placeholder value.',
    };
  }

  return {
    configured: true,
    url: rawUrl,
    publishableKey: rawKey,
  };
}

export function createSupabaseClientFromEnv(input: SupabaseConfigInput): {
  configured: boolean;
  client: SupabaseClient<Database> | null;
  reason?: string;
} {
  const check = validateSupabaseEnv(input);
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
  url: SUPABASE_PUBLIC_CONFIG.url,
  publishableKey: SUPABASE_PUBLIC_CONFIG.publishableKey,
});

export const isSupabaseConfigured = resolved.configured;
export const supabaseConfigReason = resolved.reason;
export const supabaseClient: SupabaseClient<Database> | null = resolved.client;

/**
 * Returns safe, credential-free diagnostics describing the bundled public
 * Supabase configuration and client initialization state without exposing values.
 */
export function getSupabaseDiagnostics(input?: SupabaseConfigInput): SupabaseDiagnostics {
  const source: SupabaseConfigInput = input ?? {
    url: SUPABASE_PUBLIC_CONFIG.url,
    publishableKey: SUPABASE_PUBLIC_CONFIG.publishableKey,
  };

  const { rawUrl, rawKey } = extractRawConfig(source);
  const check = validateSupabaseEnv(source);

  let keyKind: SupabaseDiagnostics['keyKind'] = 'missing';
  if (rawKey) {
    if (isSecretOrServiceRoleKey(rawKey)) {
      keyKind = 'invalid-secret';
    } else if (!check.configured && rawKey.length < 16) {
      keyKind = 'invalid';
    } else if (rawKey.startsWith('sb_publishable_')) {
      keyKind = 'publishable';
    } else if (rawKey.startsWith('eyJ')) {
      keyKind = 'anon-jwt';
    } else {
      keyKind = check.configured ? 'publishable' : 'invalid';
    }
  }

  const clientInitialized = input ? check.configured : Boolean(supabaseClient && isSupabaseConfigured);

  return {
    configured: check.configured,
    clientInitialized,
    hasUrl: Boolean(rawUrl),
    hasPublishableKey: Boolean(rawKey),
    keyKind,
    ...(check.reason ? { reason: check.reason } : {}),
  };
}
