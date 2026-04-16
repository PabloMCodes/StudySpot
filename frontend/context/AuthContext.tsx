"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  getStoredSessionAccessToken,
  onSupabaseAuthStateChange,
  signOutSupabase,
} from "../services/authService";

interface AuthContextValue {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

type AuthSource = "manual" | "supabase" | null;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessTokenState, setAccessTokenState] = useState<string | null>(null);
  const [authSource, setAuthSource] = useState<AuthSource>(null);
  const authSourceRef = useRef<AuthSource>(null);

  useEffect(() => {
    authSourceRef.current = authSource;
  }, [authSource]);

  useEffect(() => {
    let isMounted = true;

    getStoredSessionAccessToken().then((token) => {
      if (!isMounted || !token) {
        return;
      }

      setAuthSource("supabase");
      setAccessTokenState(token);
    });

    const subscription = onSupabaseAuthStateChange((token) => {
      if (!isMounted) {
        return;
      }

      if (token) {
        setAuthSource("supabase");
        setAccessTokenState(token);
        return;
      }

      if (authSourceRef.current === "supabase") {
        setAuthSource(null);
        setAccessTokenState(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const setAccessToken = useCallback((token: string | null) => {
    setAccessTokenState(token);
    setAuthSource(token ? "manual" : null);

    if (!token) {
      void signOutSupabase();
    }
  }, []);

  const logout = useCallback(async () => {
    await signOutSupabase();
    setAuthSource(null);
    setAccessTokenState(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken: accessTokenState,
      setAccessToken,
      logout,
      isAuthenticated: Boolean(accessTokenState),
    }),
    [accessTokenState, logout, setAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
