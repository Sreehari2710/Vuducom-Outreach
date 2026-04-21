"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "../config";

interface User {
  id: string;
  email: string;
  name: string;
  hasSmtpConfigured?: boolean;
  [key: string]: any;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  authLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const savedToken = localStorage.getItem("vudu_auth_token");
    const savedUser = localStorage.getItem("vudu_user");

    if (savedToken && savedUser) {
      setToken(savedToken);
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);

      // Verify and sync profile
      fetch(`${API_BASE_URL}/api/user/profile`, {
        headers: { "Authorization": `Bearer ${savedToken}` }
      })
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          const updatedUser = { ...data, hasSmtpConfigured: true };
          setUser(updatedUser);
          localStorage.setItem("vudu_user", JSON.stringify(updatedUser));
        }
      })
      .catch(err => console.error("Auth sync failed", err))
      .finally(() => setAuthLoading(false));
    } else {
      setAuthLoading(false);
    }
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("vudu_auth_token", newToken);
    localStorage.setItem("vudu_user", JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("vudu_auth_token");
    localStorage.removeItem("vudu_user");
    router.push("/login");
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem("vudu_user", JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ token, user, authLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
