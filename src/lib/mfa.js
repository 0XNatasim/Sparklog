// Two-factor authentication (TOTP, authenticator app) — migration 0103. Owner, manager and admin
// accounts must pass a 6-digit code after their password: the database only grants manager-level access
// to an `aal2` session (get_my_role / is_privileged), and the Edge Functions check the same claim.
// Keep MFA_REQUIRED_ROLES in step with public.mfa_required_role().

export const MFA_REQUIRED_ROLES = Object.freeze(["owner", "manager", "admin"]);

export function requiresMfa(role) {
  return MFA_REQUIRED_ROLES.includes(role);
}

// What the signed-in user must do before using the app:
//   "enroll"    — required role, no verified device yet: add one (QR code + first code)
//   "challenge" — a verified device exists but this session has not passed the code
//   null        — nothing to do (employee without a device, or the code was entered)
// An employee who chose to add a device is asked for the code too (opt-in).
export function mfaStep({ role, currentLevel, verifiedCount }) {
  if (currentLevel === "aal2") return null;
  if (Number(verifiedCount) > 0) return "challenge";
  return requiresMfa(role) ? "enroll" : null;
}

// Icon next to a name in Employés: "on" (a verified device), "missing" (required role without one),
// null (employee without a device: nothing to show).
export function mfaBadge(role, enrolled) {
  if (enrolled) return "on";
  return requiresMfa(role) ? "missing" : null;
}

// 6 digits typed with spaces or dashes ("123 456") → "123456"; anything else → "".
export function cleanTotpCode(value) {
  const digits = String(value ?? "").replace(/[\s-]/g, "");
  return /^[0-9]{6}$/.test(digits) ? digits : "";
}

// Each new device gets a distinct name: Supabase refuses two devices with the same name.
export function deviceName(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `Sparklog ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// i18n key for an Auth error a person can act on; null = show the raw message.
export function authErrorKey(error) {
  const code = error?.code || "";
  const message = String(error?.message || "");
  if (code === "weak_password" || /weak|pwned|leaked|compromised/i.test(message)) {
    return (error?.reasons || []).includes("pwned") || /pwned|leaked|compromised/i.test(message)
      ? "auth.passwordLeaked"
      : "auth.passwordWeak";
  }
  if (code === "mfa_verification_failed" || /invalid totp code|code.*(invalid|expired)/i.test(message)) return "mfa.invalidCode";
  if (code === "mfa_challenge_expired") return "mfa.expired";
  if (code === "too_many_enrolled_mfa_factors") return "mfa.tooManyDevices";
  if (/^mfa_totp_(enroll|verify)_not_enabled$/.test(code)) return "mfa.disabled";
  return null;
}
