import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MFA_REQUIRED_ROLES, authErrorKey, cleanTotpCode, deviceName, mfaBadge, mfaStep, requiresMfa } from "./mfa";
import { isAal2, sessionAal } from "../../supabase/functions/_shared/mfa.js";

const root = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const migration = readFileSync(root("supabase/migrations/20261019180000_0103_mfa_required_for_managers.sql"), "utf8");
const fakeJwt = (claims) => ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");

describe("two-factor authentication: who and when", () => {
  it("is required for owner, manager and admin only, like public.mfa_required_role()", () => {
    expect(MFA_REQUIRED_ROLES).toEqual(["owner", "manager", "admin"]);
    expect(migration).toContain("select coalesce(p_role in ('owner', 'manager', 'admin'), false);");
    for (const role of ["owner", "manager", "admin"]) expect(requiresMfa(role)).toBe(true);
    for (const role of ["employee", "subcontractor_1", null, undefined, "Employee"]) expect(requiresMfa(role)).toBe(false);
  });

  it("asks a management account without a device to add one, then the code at each sign-in", () => {
    expect(mfaStep({ role: "owner", currentLevel: "aal1", verifiedCount: 0 })).toBe("enroll");
    expect(mfaStep({ role: "manager", currentLevel: null, verifiedCount: 0 })).toBe("enroll");
    expect(mfaStep({ role: "admin", currentLevel: "aal1", verifiedCount: 1 })).toBe("challenge");
    expect(mfaStep({ role: "owner", currentLevel: "aal2", verifiedCount: 1 })).toBe(null);
  });

  it("never blocks an employee without a device; one who added a device enters the code", () => {
    expect(mfaStep({ role: "employee", currentLevel: "aal1", verifiedCount: 0 })).toBe(null);
    expect(mfaStep({ role: "subcontractor_1", currentLevel: null, verifiedCount: 0 })).toBe(null);
    expect(mfaStep({ role: "employee", currentLevel: "aal1", verifiedCount: 1 })).toBe("challenge");
  });

  it("shows a shield next to the name: on, missing (required role), or nothing", () => {
    expect(mfaBadge("owner", true)).toBe("on");
    expect(mfaBadge("employee", true)).toBe("on");
    expect(mfaBadge("manager", false)).toBe("missing");
    expect(mfaBadge("employee", false)).toBe(null);
  });
});

describe("two-factor authentication: input and messages", () => {
  it("accepts 6 digits with spaces or a dash, nothing else", () => {
    expect(cleanTotpCode("123456")).toBe("123456");
    expect(cleanTotpCode(" 123 456 ")).toBe("123456");
    expect(cleanTotpCode("123-456")).toBe("123456");
    expect(cleanTotpCode("12345")).toBe("");
    expect(cleanTotpCode("1234567")).toBe("");
    expect(cleanTotpCode("12a456")).toBe("");
  });

  it("names each device differently (Supabase refuses two devices with the same name)", () => {
    expect(deviceName(new Date(2026, 9, 19, 8, 5, 3))).toBe("Sparklog 2026-10-19 08:05:03");
  });

  it("explains a leaked or weak password and a wrong code in plain words", () => {
    expect(authErrorKey({ code: "weak_password", reasons: ["pwned"] })).toBe("auth.passwordLeaked");
    expect(authErrorKey({ code: "weak_password", reasons: ["length"] })).toBe("auth.passwordWeak");
    expect(authErrorKey({ code: "mfa_verification_failed", message: "Invalid TOTP code entered" })).toBe("mfa.invalidCode");
    expect(authErrorKey({ code: "mfa_challenge_expired" })).toBe("mfa.expired");
    expect(authErrorKey({ code: "mfa_totp_enroll_not_enabled" })).toBe("mfa.disabled");
    expect(authErrorKey({ message: "Invalid login credentials" })).toBe(null);
  });
});

describe("two-factor authentication: server side", () => {
  it("reads the aal claim of a verified token (Edge Functions)", () => {
    expect(sessionAal(fakeJwt({ sub: "u", aal: "aal2" }))).toBe("aal2");
    expect(isAal2(fakeJwt({ sub: "u", aal: "aal1" }))).toBe(false);
    expect(isAal2(fakeJwt({ sub: "u" }))).toBe(false);
    expect(isAal2("not-a-token")).toBe(false);
    expect(isAal2("")).toBe(false);
  });

  it("every manager-level Edge Function refuses a session without the code", () => {
    const dir = root("supabase/functions");
    const managerOnly = readdirSync(dir).filter((name) => {
      try {
        const src = readFileSync(`${dir}/${name}/index.ts`, "utf8");
        // Functions that ask the database (caller.rpc("get_my_role")) are covered by 0103 itself.
        return /Forbidden: manager/.test(src) && !/caller\.rpc\("get_my_role"\)/.test(src);
      } catch { return false; }
    });
    expect(managerOnly.length).toBeGreaterThanOrEqual(10);
    for (const name of managerOnly) {
      const src = readFileSync(`${dir}/${name}/index.ts`, "utf8");
      expect(src, name).toContain('import { isAal2 } from "../_shared/mfa.js";');
      expect(src, name).toContain('if (!isAal2(token)) return json({ ok: false, error: "mfa_required" }, 403);');
      // After the role check, before any work.
      expect(src.indexOf("isAal2(token)"), name).toBeGreaterThan(src.search(/Forbidden: manager/));
    }
  });

  it("grants manager-level access and NAS only to an aal2 session (0103)", () => {
    const fn = (name) => {
      const at = migration.indexOf(`function public.${name}(`);
      return migration.slice(at, migration.indexOf("$function$;", at));
    };
    expect(migration).toContain("select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';");
    expect(fn("get_my_role")).toContain("then case when public.session_is_aal2() then 'manager' else 'employee' end");
    expect(fn("is_privileged")).toContain("select public.session_is_aal2() and exists");
    expect(fn("mfa_enrolled_users")).toContain("public.get_my_role() = 'manager'");
    expect(migration).toContain("if actor_id is null or not public.session_is_aal2() or not exists (");
    for (const f of ["mfa_required_role(text)", "session_is_aal2()", "mfa_enrolled_users()"]) {
      expect(migration).toContain(`revoke all on function public.${f} from public, anon;`);
    }
  });
});
