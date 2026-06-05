"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "../config";

declare global {
  interface Window {
    electronAPI?: {
      saveAuth: (token: string, user: any) => void;
      getAuth: () => Promise<{ token: string; user: any } | null>;
      clearAuth: () => void;
    };
  }
}

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
    const initializeAuth = async () => {
      let savedToken = localStorage.getItem("vudu_auth_token");
      let savedUser = localStorage.getItem("vudu_user");

      // Try Electron bridge as primary source of truth if available
      if (window.electronAPI) {
        try {
          const electronAuth = await window.electronAPI.getAuth();
          if (electronAuth) {
            savedToken = electronAuth.token;
            savedUser = JSON.stringify(electronAuth.user);
            
            // Sync to localStorage for redundancy/internal use
            localStorage.setItem("vudu_auth_token", savedToken);
            localStorage.setItem("vudu_user", savedUser);
          }
        } catch (err) {
          console.error("Failed to load from Electron bridge", err);
        }
      }

      if (savedToken && savedUser) {
        setToken(savedToken);
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);

        // Verify and sync profile
        fetch(`${API_BASE_URL}/api/user/profile`, {
          headers: { "Authorization": `Bearer ${savedToken}` }
        })
        .then(res => {
          if (!res.ok) {
            const error = new Error(`Auth sync failed with status ${res.status}`);
            (error as any).status = res.status;
            throw error;
          }
          return res.json();
        })
        .then(data => {
          if (data && !data.error) {
            const { refreshedToken, ...userProfile } = data;
            const updatedUser = { ...userProfile, hasSmtpConfigured: userProfile.hasSmtpConfigured };
            const updatedToken = refreshedToken || savedToken;
            
            setToken(updatedToken);
            localStorage.setItem("vudu_auth_token", updatedToken!);
            setUser(updatedUser);
            localStorage.setItem("vudu_user", JSON.stringify(updatedUser));
            
            if (window.electronAPI) {
              window.electronAPI.saveAuth(updatedToken!, updatedUser);
            }
          } else {
            console.warn("Authentication invalid or expired on profile check", data?.error);
            logout();
          }
        })
        .catch(err => {
          console.error("Auth sync failed", err);
          // If it's an explicit 401 (Unauthorized) or 403 (Forbidden), log out immediately.
          // Do not log out for generic network fetch errors, timeouts, or 500 server errors.
          if (err.status === 401 || err.status === 403) {
            logout();
          }
        })
        .finally(() => setAuthLoading(false));
      } else {
        setAuthLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("vudu_auth_token", newToken);
    localStorage.setItem("vudu_user", JSON.stringify(newUser));
    
    if (window.electronAPI) {
      window.electronAPI.saveAuth(newToken, newUser);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("vudu_auth_token");
    localStorage.removeItem("vudu_user");
    
    if (window.electronAPI) {
      window.electronAPI.clearAuth();
    }
    
    router.push("/login");
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem("vudu_user", JSON.stringify(updatedUser));
    
    if (window.electronAPI && token) {
      window.electronAPI.saveAuth(token, updatedUser);
    }
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
