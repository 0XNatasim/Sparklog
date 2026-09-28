import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(fileURLToPath(new URL(
  "../../supabase/migrations/20260928025524_0067_employee_activity_log.sql",
  import.meta.url
)), "utf8");

describe("employee activity log contract", () => {
  it("is readable by managers only and never writable through the API", () => {
    expect(sql).toContain("alter table public.employee_activity_log enable row level security");
    expect(sql).toMatch(/for select using \(\(select public\.get_my_role\(\)\) = 'manager'\)/);
    expect(sql).toContain("revoke insert, update, delete on public.employee_activity_log from anon, authenticated");
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i);
  });

  it("lets the app log only sign-ins and app opens, de-duplicated server-side", () => {
    expect(sql).toContain("p_event not in ('login', 'app_open')");
    expect(sql).toContain("interval '30 minutes'");
    expect(sql).toContain("revoke all on function public.log_employee_activity(text, text) from public, anon");
  });

  it("logs only the job owner's own writes and can never block a job write", () => {
    expect(sql).toMatch(/if j\.user_id is distinct from uid then return null; end if;/);
    expect(sql).toContain("exception when others then");
    expect(sql).toContain("after insert or update or delete on public.jobs");
  });
});
