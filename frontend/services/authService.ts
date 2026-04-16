import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import { apiRequest, type ApiResponse } from "./api";

export interface LoginPayload {
  id_token: string;
}

interface SupabaseExchangePayload {
  access_token: string;
}

// export from the backend
export interface AuthTokenResponse {
  access_token: string;
  token_type: "bearer";
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

const SUPABASE_CONFIG_ERROR =
  "Email/password auth is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(SUPABASE_CONFIG_ERROR);
  }

  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return supabaseClient;
}

function toReadableAuthError(message: string | null | undefined): string {
  const normalized = (message ?? "").toLowerCase();

  if (!normalized) {
    return "Authentication failed. Try again.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }

  if (normalized.includes("password should be at least")) {
    return "Password must be at least 6 characters.";
  }

  if (normalized.includes("already registered") || normalized.includes("already been registered")) {
    return "An account with that email already exists.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Email confirmation is required before login.";
  }

  return message ?? "Authentication failed. Try again.";
}

export function login(payload: LoginPayload): Promise<ApiResponse<AuthTokenResponse>> {
  return apiRequest<AuthTokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function exchangeSupabaseTokenForBackendToken(
  payload: SupabaseExchangePayload,
): Promise<ApiResponse<AuthTokenResponse>> {
  return apiRequest<AuthTokenResponse>("/auth/supabase", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
): Promise<ApiResponse<AuthTokenResponse>> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.signUp({ email, password });

    if (error) {
      return { success: false, data: null, error: toReadableAuthError(error.message) };
    }

    const accessToken = data.session?.access_token ?? null;
    if (!accessToken) {
      return {
        success: true,
        data: null,
        error: null,
      };
    }

    return exchangeSupabaseTokenForBackendToken({ access_token: accessToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed. Try again.";
    return {
      success: false,
      data: null,
      error: toReadableAuthError(message),
    };
  }
}

export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<ApiResponse<AuthTokenResponse>> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });

    if (error || !data.session?.access_token) {
      return {
        success: false,
        data: null,
        error: toReadableAuthError(error?.message ?? "Login failed."),
      };
    }

    return exchangeSupabaseTokenForBackendToken({ access_token: data.session.access_token });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed.";
    return {
      success: false,
      data: null,
      error: toReadableAuthError(message),
    };
  }
}

export async function getStoredSessionAccessToken(): Promise<string | null> {
  try {
    const client = getSupabaseClient();
    const { data } = await client.auth.getSession();
    const supabaseAccessToken = data.session?.access_token ?? null;
    if (!supabaseAccessToken) {
      return null;
    }

    const exchange = await exchangeSupabaseTokenForBackendToken({ access_token: supabaseAccessToken });
    if (!exchange.success || !exchange.data?.access_token) {
      return null;
    }

    return exchange.data.access_token;
  } catch {
    return null;
  }
}

export function onSupabaseAuthStateChange(listener: (accessToken: string | null) => void): { unsubscribe: () => void } {
  try {
    const client = getSupabaseClient();
    const { data } = client.auth.onAuthStateChange(async (_event, session) => {
      const supabaseAccessToken = session?.access_token ?? null;
      if (!supabaseAccessToken) {
        listener(null);
        return;
      }

      const exchange = await exchangeSupabaseTokenForBackendToken({ access_token: supabaseAccessToken });
      listener(exchange.success ? (exchange.data?.access_token ?? null) : null);
    });

    return {
      unsubscribe: () => data.subscription.unsubscribe(),
    };
  } catch {
    return {
      unsubscribe: () => undefined,
    };
  }
}

export async function signOutSupabase(): Promise<void> {
  try {
    const client = getSupabaseClient();
    await client.auth.signOut();
  } catch {
    // no-op if Supabase is not configured
  }
}

export function deleteMyAccount(accessToken: string): Promise<ApiResponse<{ deleted: boolean }>> {
  return apiRequest<{ deleted: boolean }>("/auth/me", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
