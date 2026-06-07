import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useT } from "@/lib/use-t";

export default function Login() {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [mode, setMode] = useState("login");
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
    return s;
  }

  async function ensureProfile(userId, name, phoneRaw, emailValue) {
    const phoneNorm = normalizePhone(phoneRaw);
    const { error } = await supabase.from("profiles").upsert(
      {
        id: userId,
        full_name: name || null,
        phone: phoneNorm || null,
        email: emailValue || null,
        role: "Employee",
      },
      { onConflict: "id" }
    );
    if (error) console.warn("[Login] ensureProfile error:", error);
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
        if (createdUser?.id) {
          await ensureProfile(
            createdUser.id,
            fullName.trim(),
            phone,
            createdUser.email || email.trim()
          );
        }

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
    } catch (err) {
      setErrorMsg(err?.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background text-foreground p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">SparkLog</CardTitle>
          <CardDescription>
            {isSignup ? "Create your account" : "Log in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-3">
            {isSignup && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Simon B."
                    autoComplete="name"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="phone">Phone (with country code)</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g., +1 514 555 1234"
                    autoComplete="tel"
                  />
                </div>
              </>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                type="email"
                autoComplete="email"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {isSignup && (
              <div className="grid gap-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label="Toggle confirm password visibility"
                  >
                    {showConfirm ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <span className="text-xs text-destructive">Passwords do not match</span>
                )}
              </div>
            )}

            {errorMsg && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMsg}
              </div>
            )}

            <Button disabled={!canSubmit || loading} type="submit" className="mt-1">
              {loading ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
            </Button>

            <Button
              type="button"
              variant="link"
              onClick={() => {
                setErrorMsg("");
                setPassword("");
                setConfirmPassword("");
                setShowPassword(false);
                setShowConfirm(false);
                setMode(isSignup ? "login" : "signup");
              }}
            >
              {isSignup ? "Already have an account? Log in" : "No account? Sign up"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
