// supabase/functions/classify_week/index.ts
//
// Authoritative payroll classification (M4). Given an employee (and optional date
// range), reads their jobs server-side and returns the versioned computeWeek() result:
// per-job trace, per-week regular/OT50/OT100 totals, engine version, and warnings.
// This is the source of truth the client shows as "authoritative" and that the approval
// snapshot (M5) will record. Manager-only.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeWeek, ENGINE_VERSION } from "../_shared/payroll_engine.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    const employeeId = body?.employee_id;
    const from = body?.from;
    const to = body?.to;
    if (!employeeId) return json({ ok: false, error: "Missing employee_id" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRole || !anonKey) {
      return json({ ok: false, error: "Missing Supabase environment configuration" }, 500);
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return json({ ok: false, error: "Missing Authorization bearer token" }, 401);

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: callerRes, error: callerErr } = await caller.auth.getUser();
    if (callerErr || !callerRes?.user) return json({ ok: false, error: "Invalid session token" }, 401);

    const admin = createClient(supabaseUrl, serviceRole);
    const { data: prof, error: profErr } = await admin
      .from("profiles").select("role").eq("id", callerRes.user.id).maybeSingle();
    if (profErr) return json({ ok: false, error: profErr.message }, 500);
    if (!prof || prof.role !== "manager") return json({ ok: false, error: "Forbidden: manager role required" }, 403);

    let q = admin
      .from("jobs")
      .select("id, user_id, job_date, depart, fin, return_time_minutes, km_total, km_aller, km_retour, status")
      .eq("user_id", employeeId)
      .order("job_date", { ascending: true });
    if (from) q = q.gte("job_date", from);
    if (to) q = q.lte("job_date", to);

    const { data: jobs, error: jobsErr } = await q;
    if (jobsErr) return json({ ok: false, error: jobsErr.message }, 500);

    const result = computeWeek(jobs || []);
    return json({
      ok: true,
      source: "authority",
      engineVersion: ENGINE_VERSION,
      employeeId,
      range: { from: from || null, to: to || null },
      ...result,
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
