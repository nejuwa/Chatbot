"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import type { User } from "@/types/api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { email: string; password: string; displayName?: string }) => Promise<User>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadUser = useCallback(async () => {
    const current = await api.users.current();
    setUser(current);
    setError(null);
    return current;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await api.auth.csrf();
        const current = await api.users.current();
        if (!cancelled) setUser(current);
      } catch (cause) {
        if (!cancelled && !(cause instanceof ApiError && cause.status === 401)) {
          setError(cause instanceof Error ? cause.message : "Could not connect to the server.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const nextUser = await api.auth.login({ email, password });
    setUser(nextUser);
    setError(null);
    router.replace("/chat");
    return nextUser;
  }, [router]);

  const register = useCallback(async (input: {
    email: string;
    password: string;
    displayName?: string;
  }) => {
    const nextUser = await api.auth.register(input);
    setUser(nextUser);
    setError(null);
    router.replace("/chat");
    return nextUser;
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
      router.replace("/login");
    }
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, error, login, register, logout, reloadUser }),
    [user, loading, error, login, register, logout, reloadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
