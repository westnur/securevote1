import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { qk } from "./queries";
import type { Me, Role } from "./types";

interface AuthValue {
  me: Me | null;
  loading: boolean;
  /** True after the user signed out explicitly (the guard then stores no "return to" page). */
  signedOut: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** True if the user has any of the roles in any organization (UI convenience only — the API enforces permissions). */
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [signedOut, setSignedOut] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return await api.get<Me>("/api/auth/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const value: AuthValue = {
    me: data ?? null,
    loading: isLoading,
    signedOut,
    async login(email, password) {
      await api.post("/api/auth/login", { email, password });
      const fresh = await api.get<Me>("/api/auth/me");
      // Drop data cached for a previous user, then update "me" in place so that
      // components already observing it re-render with the new session.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      setSignedOut(false);
      qc.setQueryData(qk.me, fresh);
    },
    async logout() {
      setSignedOut(true);
      await api.post("/api/auth/logout");
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      qc.setQueryData(qk.me, null);
    },
    hasRole: (...roles) => !!data?.memberships.some((m) => m.roles.some((r) => roles.includes(r))),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
