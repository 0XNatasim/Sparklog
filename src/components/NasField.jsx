import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "../contexts/AuthContext";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";
import { isValidSin } from "@/lib/sin";

// Sensitive NAS/SIN field. The value is a Supabase Vault secret (encrypted, migration 0102) indexed by
// `employee_sensitive`, reachable only through audited RPCs (reveal_nas / set_nas, owner only).
// Non-privileged managers only ever see a mask.
// Privileged users must re-enter their password before the value is revealed, and
// every reveal is audited server-side via the reveal_nas() RPC.
export default function NasField({ employeeId, initialHasNas, privileged }) {
  const t = useT();
  const { user } = useAuth();
  const [hasNas, setHasNas] = useState(Boolean(initialHasNas));
  const [mode, setMode] = useState("hidden"); // hidden | password | editing
  const [password, setPassword] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!privileged) {
    return (
      <span className="text-sm text-muted-foreground">
        {hasNas ? "••• ••• •••" : t("employees.nasNotSet")} · {t("employees.nasOwnerOnly")}
      </span>
    );
  }

  async function confirmPassword() {
    setBusy(true); setErr("");
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: user.email, password }),
        12000
      );
      if (error) throw new Error(t("employees.nasBadPassword"));
      const { data, error: rpcErr } = await withTimeout(
        supabase.rpc("reveal_nas", { target: employeeId }),
        12000
      );
      if (rpcErr) throw rpcErr;
      setValue(data || "");
      setMode("editing");
      setPassword("");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true); setErr("");
    try {
      const clean = value.replace(/\D/g, "");
      if (clean && clean.length !== 9) throw new Error(t("employees.nasInvalid"));
      if (clean && !isValidSin(clean)) throw new Error(t("employees.nasCheckDigit"));
      // The vault has no direct table access (migration 0084): set_nas writes and audits.
      const { error } = await withTimeout(
        supabase.rpc("set_nas", { target: employeeId, p_nas: clean || null }),
        12000
      );
      if (error) throw error.message === "invalid_nas" ? new Error(t("employees.nasCheckDigit")) : error;
      setHasNas(Boolean(clean));
      setMode("hidden");
      setValue("");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setMode("hidden"); setPassword(""); setValue(""); setErr("");
  }

  if (mode === "password") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("employees.nasPasswordPrompt")}
            className="h-9"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") confirmPassword(); }}
          />
          <Button type="button" size="sm" onClick={confirmPassword} disabled={busy || !password}>{t("common.save")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={busy}>{t("common.cancel")}</Button>
        </div>
        {err && <span className="text-xs text-destructive">{err}</span>}
      </div>
    );
  }

  if (mode === "editing") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Input
            value={value}
            maxLength={9}
            inputMode="numeric"
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
            className="h-9"
            autoFocus
          />
          <Button type="button" size="sm" onClick={save} disabled={busy}>{t("common.save")}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={busy}>{t("common.cancel")}</Button>
        </div>
        {err && <span className="text-xs text-destructive">{err}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{hasNas ? "••• ••• •••" : t("employees.nasNotSet")}</span>
      <Button type="button" size="sm" variant="outline" onClick={() => setMode("password")}>{t("employees.nasReveal")}</Button>
    </div>
  );
}
