import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(""); // success/info
  const [errorMsg, setErrorMsg] = useState("");

  const isSignup = mode === "signup";

  const canSubmit = useMemo(() => {
    if (!email.trim() || !password) return false;
    if (isSignup && fullName.trim().length < 2) return false;
    return true;
  }, [email, password, fullName, isSignup]);

  // If already logged in, route to proper dashboard
  useEffect(() => {
    if (!user) return;
    if (role === "manager") navigate("/manager", { replace: true });
    else navigate("/", { replace: true });
  }, [user, role, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setMessage("");
    if (!canSubmit || loading) return;

    setLoading(true);
    try {
      if (isSignup) {
        // Store full_name in user metadata so the DB trigger can auto-create profiles correctly
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim()
            }
          }
        });
        if (error) throw error;

        // If email confirmation is enabled, Supabase may return no session until confirmed.
        if (!data?.session) {
          setMessage("Signup successful. Please check your email to confirm, then log in.");
          setMode("login");
          setPassword("");
          return;
        }

        // If session exists, AuthContext will redirect automatically
        setMessage("Signup successful. Redirecting…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (error) throw error;

        // AuthContext will redirect automatically
      }
    } catch (err) {
      setErrorMsg(err?.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>SparkLog</div>
        <div style={{ color: "#666", marginBottom: 16 }}>
          {isSignup ? "Create your account" : "Log in to your account"}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
          {isSignup && (
            <label style={styles.label}>
              Full name
              <input
                style={styles.input}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g., Simon B."
                autoComplete="name"
              />
            </label>
          )}

          <label style={styles.label}>
            Email
            <input
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              type="email"
              autoComplete="email"
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
            />
          </label>

          {errorMsg && <div style={styles.error}>{errorMsg}</div>}
          {message && <div style={styles.success}>{message}</div>}

          <button disabled={!canSubmit || loading} style={styles.primaryBtn}>
            {loading ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
          </button>

          <button
            type="button"
            onClick={() => {
              setErrorMsg("");
              setMessage("");
              setMode(isSignup ? "login" : "signup");
            }}
            style={styles.linkBtn}
          >
            {isSignup ? "Already have an account? Log in" : "No account? Sign up"}
          </button>
        </form>

        <div style={{ marginTop: 14, color: "#666", fontSize: 12, lineHeight: 1.4 }}>
          Note: If Supabase email confirmation is enabled, you must confirm via email before login.
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f5f5f5",
    padding: 16
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 18,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)"
  },
  label: { display: "grid", gap: 6, fontSize: 13, color: "#555" },
  input: {
    border: "1px solid #eee",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none"
  },
  primaryBtn: {
    background: "#1565c0",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer"
  },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#1565c0",
    padding: 0,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13
  },
  error: {
    background: "rgba(220,20,60,0.08)",
    border: "1px solid rgba(220,20,60,0.2)",
    color: "crimson",
    padding: 10,
    borderRadius: 10,
    fontSize: 13
  },
  success: {
    background: "rgba(76,175,80,0.10)",
    border: "1px solid rgba(76,175,80,0.25)",
    color: "#2e7d32",
    padding: 10,
    borderRadius: 10,
    fontSize: 13
  }
};
