import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import logoUrl from "../../public/logo.jpg";
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
  const [searchParams] = useSearchParams();
  const { user, role } = useAuth();
  const t = useT();

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
  const [successMsg, setSuccessMsg] = useState(
    searchParams.get("passwordReset") === "success" ? t("auth.passwordResetSuccess") : ""
  );

  const isSignup = mode === "signup";
  const isForgotPassword = mode === "forgot";

  React.useEffect(() => {
    if (user) {
      if (role === "manager") navigate("/manager", { replace: true });
      else navigate("/", { replace: true });
    }
  }, [user, role, navigate]);

  const passwordsMatch = !isSignup || password === confirmPassword;

  const canSubmit = useMemo(() => {
    if (!email.trim()) return false;
    if (isForgotPassword) return true;
    if (!password) return false;
    if (isSignup && fullName.trim().length < 2) return false;
    if (isSignup && password !== confirmPassword) return false;
    return true;
  }, [email, password, confirmPassword, fullName, isSignup, isForgotPassword]);

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
    setSuccessMsg("");
    if (!canSubmit) return;

    setLoading(true);
    try {
      if (isForgotPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSuccessMsg(t("auth.resetEmailSent"));
      } else if (isSignup) {
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
          setErrorMsg(t("auth.signupCheckEmail"));
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
      setErrorMsg(err?.message || t("auth.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background text-foreground p-4">
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <ThemeToggle />
        <LanguageToggle />
      </div>
      <Card className="w-full max-w-md">
        <div className="flex justify-center pt-6">
          <img src={logoUrl} alt="Messier Connexion" className="w-40 rounded-2xl" />
        </div>
        <CardHeader>
          <CardTitle className="text-2xl">{t("auth.title")}</CardTitle>
          <CardDescription>
            {isSignup ? t("auth.descSignup") : isForgotPassword ? t("auth.forgotDescription") : t("auth.descLogin")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-3">
            {isSignup && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="fullName">{t("auth.fullName")}</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t("auth.fullNamePlaceholder")}
                    autoComplete="name"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="phone">{t("auth.phone")}</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder={t("auth.phonePlaceholder")}
                    autoComplete="tel"
                    inputMode="numeric"
                    maxLength={15}
                  />
                </div>
              </>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.emailPlaceholder")}
                type="email"
                autoComplete="email"
              />
            </div>

            {!isForgotPassword && <div className="grid gap-1.5">
              <Label htmlFor="password">{t("auth.password")}</Label>
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
                  aria-label={t("auth.togglePasswordVisibility")}
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            </div>}

            {isSignup && (
              <div className="grid gap-1.5">
                <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
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
                    aria-label={t("auth.toggleConfirmVisibility")}
                  >
                    {showConfirm ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <span className="text-xs text-destructive dark:text-red-300">{t("auth.passwordsDoNotMatch")}</span>
                )}
              </div>
            )}

            {errorMsg && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:text-red-300">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-400" role="status">
                {successMsg}
              </div>
            )}

            <Button disabled={!canSubmit || loading} type="submit" className="mt-1">
              {loading ? t("common.pleaseWait") : isForgotPassword ? t("auth.sendResetLink") : isSignup ? t("auth.signupButton") : t("auth.loginButton")}
            </Button>

            {!isSignup && !isForgotPassword && (
              <Button type="button" variant="link" className="-my-2" onClick={() => {
                setErrorMsg("");
                setSuccessMsg("");
                setMode("forgot");
              }}>
                {t("auth.forgotPassword")}
              </Button>
            )}

            <Button
              type="button"
              variant="link"
              onClick={() => {
                setErrorMsg("");
                setPassword("");
                setConfirmPassword("");
                setShowPassword(false);
                setShowConfirm(false);
                setSuccessMsg("");
                setMode(isSignup || isForgotPassword ? "login" : "signup");
              }}
            >
              {isSignup || isForgotPassword ? t("auth.backToLogin") : t("auth.noAccount")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
