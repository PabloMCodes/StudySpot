"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface AuthContextValue {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      setAccessToken,
      isAuthenticated: Boolean(accessToken),
    }),
    [accessToken],
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
