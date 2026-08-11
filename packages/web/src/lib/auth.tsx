import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { api, clearToken, getToken, setToken, type Me } from "./api";

interface AuthValue {
  user: Me | null;
  loading: boolean;
  signIn: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // The token is mirrored into React state, not read from localStorage during
  // render: writing to localStorage does not re-render anything, so without
  // this a fresh sign-in leaves `user` null for a tick and the router bounces
  // the user straight back to /login.
  const [token, setTokenState] = useState<string | null>(() => getToken());

  const { data, isLoading, isError } = useQuery({
    queryKey: ["me", token],
    queryFn: api.me,
    enabled: Boolean(token),
    retry: false,
  });

  const signIn = useCallback((newToken: string) => {
    setToken(newToken);
    setTokenState(newToken);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setTokenState(null);
    queryClient.clear();
  }, [queryClient]);

  // A rejected token (expired, revoked, or from a wiped database) should log
  // the user out rather than leave the app stuck on a spinner.
  const user = isError ? null : (data ?? null);
  const loading = Boolean(token) && isLoading;

  const value = useMemo<AuthValue>(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
