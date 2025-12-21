import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

async function fetchRoleForUser(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[Auth] fetchRole error:", error);
    return { role: "electrician", full_name: null };
  }
  if (!data) return { role: "electrician", full_name: null };

  return { role: data.role || "electrician", full_name: data.full_name || null };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [fullName, setFullName] = useState(null);
  const [loading, setLoading] = useState(true);

  const subscriptionRef = useRef(null);
  const isBootstrappedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (isBootstrappedRef.current) return;
      isBootstrappedRef.current = true;

      setLoading(true);

      const { data, error } = await supabase.auth.getSession();
      if (error) console.warn("[Auth] getSession error:", error);

      const sessionUser = data?.session?.user ?? null;

      if (!cancelled) {
        setUser(sessionUser);
        if (sessionUser) {
          const r = await fetchRoleForUser(sessionUser.id);
          if (!cancelled) {
            setRole(r.role);
            setFullName(r.full_name);
          }
        } else {
          setRole(null);
          setFullName(null);
        }
        setLoading(false);
      }

      // StrictMode-safe: clean up any prior subscription before creating a new one
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe?.();
        subscriptionRef.current = null;
      }

      const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
        const nextUser = session?.user ?? null;
        setUser(nextUser);

        if (nextUser) {
          const r = await fetchRoleForUser(nextUser.id);
          setRole(r.role);
          setFullName(r.full_name);
        } else {
          setRole(null);
          setFullName(null);
        }

        setLoading(false);
      });

      subscriptionRef.current = sub?.subscription ?? null;
    }

    bootstrap();

    return () => {
      cancelled = true;
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe?.();
        subscriptionRef.current = null;
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      role,
      fullName,
      loading,
      async signOut() {
        await supabase.auth.signOut();
      }
    }),
    [user, role, fullName, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
