import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { apiFetch } from "@/utils/api";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { signInAnonymously, signOut as firebaseSignOut } from "firebase/auth";

export type Role =
  | "FC"
  | "ENGINEERING"
  | "PURCHASING"
  | "WAREHOUSE"
  | "PRODUCTION"
  | "SALES"
  | "HR";
export type Level = "STAFF" | "MANAGER";

export interface User {
  id?: string;
  username: string;
  role: Role;
  level: Level;
  name: string;
  status?: string;
}

interface AuthContextType {
  user: User | null;
  login: (userData: User, token?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize and ensure Firebase client connection
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("erp_user");
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
      
      // Ensure Firebase client SDK authentication is active for real-time Firestore listeners
      if (isFirebaseConfigured && !auth.currentUser) {
        signInAnonymously(auth).catch((err) => {
          console.warn("[AuthBridge] Firebase anonymous sign-in fallback:", err?.message || err);
        });
      }
    } catch (err) {
      console.error("Failed to parse stored user", err);
      localStorage.removeItem("erp_user");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    let lastReset = 0;
    const resetTimeout = () => {
      const now = Date.now();
      if (now - lastReset < 30000) return; // Throttle to max once every 30 seconds
      lastReset = now;
      if (timeoutId) clearTimeout(timeoutId);
      if (user) {
        timeoutId = setTimeout(
          () => {
            logout();
            window.location.reload();
          },
          24 * 60 * 60 * 1000,
        ); // 24 hours
      }
    };

    const handleUnauthorized = () => {
      const hasStoredUser = typeof window !== "undefined" && !!localStorage.getItem("erp_user");
      if (!hasStoredUser && user) {
        logout();
        window.location.reload();
      }
    };

    if (user) {
      window.addEventListener("mousemove", resetTimeout, { passive: true });
      window.addEventListener("keydown", resetTimeout, { passive: true });
      window.addEventListener("click", resetTimeout, { passive: true });
      window.addEventListener("scroll", resetTimeout, { passive: true });
      window.addEventListener("api:unauthorized", handleUnauthorized);
      resetTimeout(); // Init
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("mousemove", resetTimeout);
      window.removeEventListener("keydown", resetTimeout);
      window.removeEventListener("click", resetTimeout);
      window.removeEventListener("scroll", resetTimeout);
      window.removeEventListener("api:unauthorized", handleUnauthorized);
    };
  }, [user]);

  const login = useCallback((userData: User, token?: string) => {
    setUser(userData);
    localStorage.setItem("erp_user", JSON.stringify(userData));
    if (token) {
      localStorage.setItem("erp_token", token);
    }
  }, []);

  const logout = useCallback(() => {
    if (user) {
      apiFetch("/api/users/logout", { method: "POST" }, user.username).catch(
        (e) => console.error("Failed to clear local user status", e)
      );
    }
    firebaseSignOut(auth).catch(() => {});
    setUser(null);
    localStorage.removeItem("erp_user");
    localStorage.removeItem("erp_token");
  }, [user]);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {!isLoading ? children : null}
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
