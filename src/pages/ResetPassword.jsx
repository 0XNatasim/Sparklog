import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useT } from "@/lib/use-t";

export default function ResetPassword() {
  const t = useT();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const passwordsMatch = password === confirmPassword;
  const canSubmit = password.length >= 6 && passwordsMatch;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setErrorMsg("");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setErrorMsg(error.message || t("auth.resetInvalidLink"));
      return;
    }

    await supabase.auth.signOut();
    window.location.replace(`${window.location.origin}/#/login?passwordReset=success`);
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background text-foreground p-4">
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <ThemeToggle />
        <LanguageToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{t("auth.resetTitle")}</CardTitle>
          <CardDescription>{t("auth.resetDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">{t("auth.newPassword")}</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={t("auth.togglePasswordVisibility")}
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
              <span className="text-xs text-muted-foreground">{t("auth.passwordRequirement")}</span>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="confirm-new-password">{t("auth.confirmPassword")}</Label>
              <Input
                id="confirm-new-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
              {confirmPassword && !passwordsMatch && (
                <span className="text-xs text-destructive dark:text-red-300">{t("auth.passwordsDoNotMatch")}</span>
              )}
            </div>

            {errorMsg && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:text-red-300">
                {errorMsg}
              </div>
            )}

            <Button type="submit" disabled={!canSubmit || loading}>
              {loading ? t("common.pleaseWait") : t("auth.saveNewPassword")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
