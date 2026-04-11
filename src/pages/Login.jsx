import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";

function EyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const isSignup = mode === "signup";

  React.useEffect(() => {
    if (user) {
      if (role === "manager") navigate("/manager", { replace: true });
      else navigate("/", { replace: true });
    }
  }, [user, role, navigate]);

  const passwordsMatch = !isSignup || password === confirmPassword;

  const canSubmit = useMemo(() => {
    if (!email.trim() || !password) return false;
    if (isSignup && fullName.trim().length < 2) return false;
    if (isSignup && password !== confirmPassword) return false;
    return true;
  }, [email, password, confirmPassword, fullName, phone, isSignup]);

  function normalizePhone(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";

    // keep: +, digits, space, dash, parentheses
    // (light normalization; you can make stricter later)
    return s;
  }

  async function ensureProfile(userId, name, phoneRaw, emailValue) {
    const phoneNorm = normalizePhone(phoneRaw);

    const { error } = await supabase.from("profiles").upsert(
      {
        id: userId,
        full_name: name || null,
        phone: phoneNorm || null,
        email: emailValue || null, // ✅ store email in profiles
        role: "Employee",
      },
      { onConflict: "id" }
    );

    if (error) {
      console.warn("[Login] ensureProfile error:", error);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    if (!canSubmit) return;

    setLoading(true);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
            data: {
              full_name: fullName.trim(),
              phone: normalizePhone(phone),
            },
          },
        });
        if (error) throw error;

        const createdUser = data?.user;

        // ✅ Create/Upsert profile immediately (even if email confirmation is enabled)
        if (createdUser?.id) {
          await ensureProfile(
            createdUser.id,
            fullName.trim(),
            phone,
            createdUser.email || email.trim()
          );
        }

        // If email confirmation is enabled, session is null until user confirms.
        if (!data?.session) {
          setErrorMsg(
            "Signup successful. Check your email inbox/spam to confirm, then log in."
          );
          setMode("login");
          setPassword("");
          setLoading(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }

      // AuthContext will redirect after session updates.
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
            <>
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

              <label style={styles.label}>
                Phone (with country code)
                <input
                  style={styles.input}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g., +1 514 555 1234"
                  autoComplete="tel"
                />
              </label>
            </>
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
            <div style={styles.passwordWrap}>
              <input
                style={styles.passwordInput}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                autoComplete={isSignup ? "new-password" : "current-password"}
              />
              <button type="button" style={styles.eyeBtn} onClick={() => setShowPassword(v => !v)}>
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </label>

          {isSignup && (
            <label style={styles.label}>
              Confirm password
              <div style={styles.passwordWrap}>
                <input
                  style={styles.passwordInput}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                />
                <button type="button" style={styles.eyeBtn} onClick={() => setShowConfirm(v => !v)}>
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <span style={{ color: "crimson", fontSize: 12 }}>Passwords do not match</span>
              )}
            </label>
          )}

          {errorMsg && <div style={styles.error}>{errorMsg}</div>}

          <button disabled={!canSubmit || loading} style={styles.primaryBtn}>
            {loading ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
          </button>

          <button
            type="button"
            onClick={() => {
              setErrorMsg("");
              setPassword("");
              setConfirmPassword("");
              setShowPassword(false);
              setShowConfirm(false);
              setMode(isSignup ? "login" : "signup");
            }}
            style={styles.linkBtn}
          >
            {isSignup ? "Already have an account? Log in" : "No account? Sign up"}
          </button>
        </form>
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
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 18,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },
  label: { display: "grid", gap: 6, fontSize: 13, color: "#555" },
  input: {
    border: "1px solid #eee",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
  },
  primaryBtn: {
    background: "#1565c0",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    opacity: 1,
  },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#1565c0",
    padding: 0,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  },
  passwordWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  passwordInput: {
    flex: 1,
    border: "1px solid #eee",
    borderRadius: 10,
    padding: "10px 40px 10px 12px",
    fontSize: 14,
    outline: "none",
    width: "100%",
  },
  eyeBtn: {
    position: "absolute",
    right: 10,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "#999",
    display: "flex",
    alignItems: "center",
    padding: 0,
  },
  error: {
    background: "rgba(220,20,60,0.08)",
    border: "1px solid rgba(220,20,60,0.2)",
    color: "crimson",
    padding: 10,
    borderRadius: 10,
    fontSize: 13,
  },
};
