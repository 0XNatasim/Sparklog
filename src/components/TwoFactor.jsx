import React, { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";
import { authErrorKey, cleanTotpCode, deviceName, requiresMfa } from "@/lib/mfa";
import { useConfirmDialog } from "@/components/ConfirmDialog";

// Two-factor authentication (migration 0103): first device (QR code + first code), code after the
// password, and the device list in Profil. Supabase Auth keeps the secret; the app never stores it.

function useErrorText() {
  const t = useT();
  return useCallback((e) => {
    const key = authErrorKey(e);
    return key ? t(key) : e?.message || String(e);
  }, [t]);
}

// Supabase only hands the new token to Realtime on SIGNED_IN / TOKEN_REFRESHED, not after the code: without
// this, live manager notifications would keep the pre-code (aal1) token for up to an hour.
async function shareVerifiedSession() {
  await withTimeout(supabase.realtime.setAuth(), 5000).catch(() => undefined);
}

function CodeInput({ value, onChange, onEnter, autoFocus }) {
  const t = useT();
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9\s-]/g, "").slice(0, 8))}
      onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="123 456"
      aria-label={t("mfa.codeLabel")}
      className="h-11 text-center font-mono text-lg tracking-widest"
      autoFocus={autoFocus}
    />
  );
}

// Adds one authenticator device: enrol → show QR / key → verify the first code.
export function MfaEnroll({ onDone, onCancel }) {
  const t = useT();
  const errorText = useErrorText();
  const [factor, setFactor] = useState(null); // { id, qr, secret }
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        // A device left half-added (QR shown, code never entered) is removed first.
        const { data: list } = await withTimeout(supabase.auth.mfa.listFactors(), 12000);
        for (const f of (list?.all || []).filter((x) => x.status !== "verified")) {
          await withTimeout(supabase.auth.mfa.unenroll({ factorId: f.id }), 12000).catch(() => undefined);
        }
        const { data, error } = await withTimeout(
          supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: deviceName(), issuer: "Sparklog" }),
          12000
        );
        if (error) throw error;
        setFactor({ id: data.id, qr: data.totp?.qr_code, secret: data.totp?.secret });
      } catch (e) {
        setErr(errorText(e));
      }
    })();
  }, [errorText]);

  async function verify() {
    const clean = cleanTotpCode(code);
    if (!clean) { setErr(t("mfa.codeFormat")); return; }
    if (!factor) return;
    setBusy(true); setErr("");
    try {
      const { error } = await withTimeout(supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: clean }), 12000);
      if (error) throw error;
      await shareVerifiedSession();
      await onDone?.();
    } catch (e) {
      setErr(errorText(e));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-left">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t("mfa.enrollStep1")}</li>
        <li>{t("mfa.enrollStep2")}</li>
        <li>{t("mfa.enrollStep3")}</li>
      </ol>
      {factor?.qr ? (
        <div className="flex flex-col items-center gap-2">
          <img src={factor.qr} alt={t("mfa.qrAlt")} className="h-44 w-44 rounded bg-white p-2" />
          <details className="w-full text-xs text-muted-foreground">
            <summary className="cursor-pointer">{t("mfa.manualKey")}</summary>
            <code className="mt-1 block select-all break-all rounded bg-muted p-2 font-mono text-sm text-foreground">{factor.secret}</code>
          </details>
        </div>
      ) : (
        !err && <p className="text-center text-sm text-muted-foreground">{t("common.loading")}</p>
      )}
      <CodeInput value={code} onChange={setCode} onEnter={verify} />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="flex-1" onClick={verify} disabled={busy || !factor}>{t("mfa.activate")}</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>{t("common.cancel")}</Button>}
      </div>
    </div>
  );
}

// Asks the code of an existing device after the password.
export function MfaChallenge({ onDone }) {
  const t = useT();
  const errorText = useErrorText();
  const [factors, setFactors] = useState([]);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await withTimeout(supabase.auth.mfa.listFactors(), 12000);
        if (error) throw error;
        if (cancelled) return;
        const totp = data?.totp || [];
        setFactors(totp);
        setFactorId(totp[0]?.id || "");
      } catch (e) {
        if (!cancelled) setErr(errorText(e));
      }
    })();
    return () => { cancelled = true; };
  }, [errorText]);

  async function verify() {
    const clean = cleanTotpCode(code);
    if (!clean) { setErr(t("mfa.codeFormat")); return; }
    if (!factorId) return;
    setBusy(true); setErr("");
    try {
      const { error } = await withTimeout(supabase.auth.mfa.challengeAndVerify({ factorId, code: clean }), 12000);
      if (error) throw error;
      await shareVerifiedSession();
      await onDone?.();
    } catch (e) {
      setErr(errorText(e));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-left">
      <p className="text-sm text-muted-foreground">{t("mfa.challengeHint")}</p>
      {factors.length > 1 && (
        <select value={factorId} onChange={(e) => setFactorId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" aria-label={t("mfa.device")}>
          {factors.map((f) => <option key={f.id} value={f.id}>{f.friendly_name || f.id.slice(0, 8)}</option>)}
        </select>
      )}
      <CodeInput value={code} onChange={setCode} onEnter={verify} autoFocus />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="button" className="w-full" onClick={verify} disabled={busy || !factorId}>{t("mfa.verify")}</Button>
      <p className="text-xs text-muted-foreground">{t("mfa.lostPhone")}</p>
    </div>
  );
}

// Full screen shown by ProtectedRoute until the session passed the code (or a first device is added).
export function MfaGate({ step }) {
  const t = useT();
  const { refreshMfa, signOut, mfa } = useAuth();
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm space-y-4">
        <img src="/header-light.webp" alt="SparkLog" className="mx-auto w-56 max-w-full rounded dark:hidden" />
        <img src="/header-dark.webp" alt="SparkLog" className="mx-auto hidden w-56 max-w-full dark:block" />
        <div className="flex items-center justify-center gap-2 text-xl font-bold">
          <ShieldCheck className="h-6 w-6 text-primary" />
          {step === "enroll" ? t("mfa.enrollTitle") : t("mfa.challengeTitle")}
        </div>
        {step === "enroll" && <p className="text-sm text-muted-foreground">{t("mfa.enrollWhy")}</p>}
        {mfa?.error && <p className="text-sm text-destructive">{mfa.error}</p>}
        {step === "enroll" ? <MfaEnroll onDone={refreshMfa} /> : <MfaChallenge onDone={refreshMfa} />}
        <button type="button" onClick={signOut} className="w-full rounded-md border px-4 py-2 text-sm font-semibold">
          {t("nav.signOut")}
        </button>
      </div>
    </div>
  );
}

// Profil: the account's devices, add a backup device, remove one (never the last one of a required role).
export function TwoFactorSettings({ bare = false }) {
  const t = useT();
  const errorText = useErrorText();
  const { role, refreshMfa } = useAuth();
  const [confirm, dialog] = useConfirmDialog();
  const [factors, setFactors] = useState(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await withTimeout(supabase.auth.mfa.listFactors(), 12000);
        if (error) throw error;
        if (!cancelled) setFactors(data?.totp || []);
      } catch (e) {
        if (!cancelled) { setErr(errorText(e)); setFactors([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey, errorText]);

  async function remove(f) {
    const ok = await confirm(t("mfa.removeConfirm", { name: f.friendly_name || "" }));
    if (!ok) return;
    setErr("");
    try {
      const { error } = await withTimeout(supabase.auth.mfa.unenroll({ factorId: f.id }), 12000);
      if (error) throw error;
      load();
      await refreshMfa();
    } catch (e) {
      setErr(errorText(e));
    }
  }

  if (factors === null) return null;
  if (!requiresMfa(role) && factors.length === 0) return null;
  const lastRequired = requiresMfa(role) && factors.length <= 1;

  return (
    <div className={bare ? "space-y-3" : "mt-4 space-y-3 border-t pt-4"}>
      {dialog}
      <div className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="h-4 w-4 text-primary" />{bare ? t("mfa.devices") : t("mfa.settingsTitle")}
        <span className={`rounded-full px-2 py-0.5 text-xs ${factors.length ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
          {factors.length ? t("mfa.on") : t("mfa.off")}
        </span>
      </div>
      <ul className="space-y-2">
        {factors.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
            <span className="flex min-w-0 items-center gap-2"><Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{f.friendly_name || f.id.slice(0, 8)}</span></span>
            <Button type="button" size="sm" variant="ghost" onClick={() => remove(f)} disabled={lastRequired} title={lastRequired ? t("mfa.lastDevice") : t("mfa.remove")} aria-label={t("mfa.remove")}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      {lastRequired && <p className="text-xs text-muted-foreground">{t("mfa.backupHint")}</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}
      {adding ? (
        <MfaEnroll onDone={async () => { setAdding(false); load(); await refreshMfa(); }} onCancel={() => { setAdding(false); load(); }} />
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>{t("mfa.addDevice")}</Button>
      )}
    </div>
  );
}
