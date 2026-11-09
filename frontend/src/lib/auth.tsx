"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api, refreshSession, setAccessToken } from "./api";

export type User = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role:
    | "SUPER_ADMIN"
    | "COMPANY_ADMIN"
    | "COMPANY_MEMBER"
    | "MANAGER"
    | "EMPLOYEE";
  companyId: string;
  isActive: boolean;
};

type RegisterInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
};

type AuthTokens = {
  accessToken: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  acceptInvite: (input: {
    token: string;
    firstName: string;
    lastName: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        if (await refreshSession()) {
          const currentUser = await api<User>("/users/me");
          if (mounted) setUser(currentUser);
        }
      } catch {
        setAccessToken(null);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await api<AuthTokens>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(tokens.accessToken);
    try {
      setUser(await api<User>("/users/me"));
    } catch (error) {
      setAccessToken(null);
      throw error;
    }
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        companyName: input.companyName,
        email: input.email,
        password: input.password,
      }),
    });

    const tokens = await api<AuthTokens>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: input.email, password: input.password }),
    });
    setAccessToken(tokens.accessToken);
    try {
      const currentUser = await api<User>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: input.firstName,
          lastName: input.lastName,
        }),
      });
      setUser(currentUser);
    } catch (error) {
      setAccessToken(null);
      throw error;
    }
  }, []);

  const acceptInvite = useCallback<AuthContextValue["acceptInvite"]>(
    async (input) => {
      await api("/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, acceptInvite, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
