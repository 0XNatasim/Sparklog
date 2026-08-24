import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);
export const SESSION_RESUMED_EVENT = "sparklog:session-resumed";

async function fetchRoleForUser(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, full_name, is_paused")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[Auth] fetchRole error:", error);
    return { role: "Employee", full_name: null, is_paused: false };
  }
  if (!data) return { role: "Employee", full_name: null, is_paused: false };

  return { role: data.role || "Employee", full_name: data.full_name || null, is_paused: Boolean(data.is_paused) };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [fullName, setFullName] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const subscriptionRef = useRef(null);
  const profileChannelRef = useRef(null);
  const isBootstrappedRef = useRef(false);
  const resumeInFlightRef = useRef(false);
  const resumeDebounceRef = useRef(null);

  const subscribeToProfile = useCallback((userId) => {
    if (profileChannelRef.current) {
      supabase.removeChannel(profileChannelRef.current);
      profileChannelRef.current = null;
    }
    if (!userId) return;
    profileChannelRef.current = supabase
      .channel(`profile-access-${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, (payload) => {
        setRole(payload.new?.role || "Employee");
        setFullName(payload.new?.full_name || null);
        setIsPaused(Boolean(payload.new?.is_paused));
      })
      .subscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fallbackTimer = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 10000);

    async function bootstrap() {
      if (isBootstrappedRef.current) return;
      isBootstrappedRef.current = true;

      setLoading(true);

      let data = null;
      let error = null;
      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Supabase session request timed out.")), 8000)
          ),
        ]);
        data = result?.data ?? null;
        error = result?.error ?? null;
      } catch (e) {
        error = e;
      }

      if (error) {
        const msg = error instanceof Error ? error.message : "Failed to reach Supabase auth.";
        console.warn("[Auth] getSession error:", msg);
        setAuthError(msg);
      } else {
        setAuthError("");
      }

      const sessionUser = data?.session?.user ?? null;

      if (!cancelled) {
        setUser(sessionUser);
        setLoading(false);
        if (sessionUser) {
          const r = await fetchRoleForUser(sessionUser.id);
          if (!cancelled) {
            setRole(r.role);
            setFullName(r.full_name);
            setIsPaused(r.is_paused);
          }
        } else {
          setRole(null);
          setFullName(null);
          setIsPaused(false);
        }
      }

      if (cancelled) return;

      // StrictMode-safe: clean up any prior subscription before creating a new one
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe?.();
        subscriptionRef.current = null;
      }

      const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        setLoading(false);
        setAuthError("");

        if (nextUser) {
          const r = await fetchRoleForUser(nextUser.id);
          setRole(r.role);
          setFullName(r.full_name);
          setIsPaused(r.is_paused);
          subscribeToProfile(nextUser.id);
        } else {
          setRole(null);
          setFullName(null);
          setIsPaused(false);
          subscribeToProfile(null);
        }
      });

      subscriptionRef.current = sub?.subscription ?? null;

      subscribeToProfile(sessionUser?.id);
    }

    bootstrap();

    return () => {
      cancelled = true;
      isBootstrappedRef.current = false;
      clearTimeout(fallbackTimer);
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe?.();
        subscriptionRef.current = null;
      }
      if (profileChannelRef.current) {
        supabase.removeChannel(profileChannelRef.current);
        profileChannelRef.current = null;
      }
    };
  }, [subscribeToProfile]);

  useEffect(() => {
    let cancelled = false;

    async function recoverSessionOnResume() {
      if (cancelled || resumeInFlightRef.current) return;
      resumeInFlightRef.current = true;
      try {
        let session = null;
        let sessionError = null;
        try {
          const result = await supabase.auth.getSession();
          session = result.data?.session ?? null;
          sessionError = result.error ?? null;
        } catch (error) {
          sessionError = error;
        }
        const expiresSoon = session?.expires_at && session.expires_at * 1000 <= Date.now() + 60_000;

        if (sessionError || !session || expiresSoon) {
          const refreshed = await supabase.auth.refreshSession();
          if (refreshed.error) throw refreshed.error;
          session = refreshed.data?.session ?? null;
        }

        if (cancelled) return;
        if (session?.user?.id) {
          const profile = await fetchRoleForUser(session.user.id);
          if (cancelled) return;
          setRole(profile.role);
          setFullName(profile.full_name);
          setIsPaused(profile.is_paused);
        }
        subscribeToProfile(session?.user?.id ?? null);
        window.dispatchEvent(new CustomEvent(SESSION_RESUMED_EVENT));
      } catch (error) {
        if (!cancelled) console.warn("[Auth] session resume recovery failed:", error);
      } finally {
        resumeInFlightRef.current = false;
      }
    }

    function scheduleResumeRecovery() {
      if (resumeDebounceRef.current) clearTimeout(resumeDebounceRef.current);
      resumeDebounceRef.current = setTimeout(() => {
        resumeDebounceRef.current = null;
        recoverSessionOnResume();
      }, 200);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") scheduleResumeRecovery();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", scheduleResumeRecovery);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", scheduleResumeRecovery);
      if (resumeDebounceRef.current) {
        clearTimeout(resumeDebounceRef.current);
        resumeDebounceRef.current = null;
      }
    };
  }, [subscribeToProfile]);

  const value = useMemo(
    () => ({
      user,
      role,
      fullName,
      isPaused,
      loading,
      authError,
      async signOut() {
        await supabase.auth.signOut();
      }
    }),
    [user, role, fullName, isPaused, loading, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
