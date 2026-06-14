// supabase/functions/push_approved_batch/index.ts
//
// Batch counterpart of push_approved_to_sheet. Accepts an array of job_ids,
// builds one payload, POSTs it to Apps Script once, then marks every job
// as approved + exported in a single UPDATE. Trades many ~3s round-trips
// for one ~3s round-trip regardless of batch size.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatHeures(depart?: string | null, fin?: string | null) {
  if (!depart || !fin) return "";
  const [dh, dm] = String(depart).split(":").map(Number);
  const [fh, fm] = String(fin).split(":").map(Number);
  if ([dh, dm, fh, fm].some((n) => Number.isNaN(n))) return "";
  let mins = fh * 60 + fm - (dh * 60 + dm);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function formatMontrealShort(d: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Toronto",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("hour")}:${get("minute")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const body = await req.json().catch(() => ({}));
    const job_ids: string[] = Array.isArray(body?.job_ids) ? body.job_ids : [];
    if (job_ids.length === 0) {
      return json({ ok: false, error: "Missing job_ids[]" }, 400);
    }
    if (job_ids.length > 500) {
      return json({ ok: false, error: "Batch too large (max 500)" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const appsScriptUrl = Deno.env.get("APPS_SCRIPT_URL") ?? "";
    const appsScriptToken = Deno.env.get("APPS_SCRIPT_TOKEN") ?? "";

    if (!supabaseUrl || !serviceRole || !anonKey) {
      return json({ ok: false, error: "Server env not configured" }, 500);
    }
    if (!appsScriptUrl || !appsScriptToken) {
      return json({ ok: false, error: "Apps Script env not configured" }, 500);
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!token) return json({ ok: false, error: "Missing bearer token" }, 401);

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: callerUser, error: callerErr } = await caller.auth.getUser();
    if (callerErr || !callerUser?.user) {
      return json({ ok: false, error: "Invalid session token" }, 401);
    }
    const approverId = callerUser.user.id;
    const approverEmail = callerUser.user.email || "";

    const admin = createClient(supabaseUrl, serviceRole);

    const { data: approverProfile } = await admin
      .from("profiles")
      .select("role, full_name")
      .eq("id", approverId)
      .maybeSingle();
    if (!approverProfile || approverProfile.role !== "manager") {
      return json({ ok: false, error: "Forbidden: manager role required" }, 403);
    }
    const approved_by_value =
      (approverProfile.full_name || "").trim() || approverEmail || approverId;

    // Fetch all jobs in one query — only those still submitted + not exported
    const { data: jobs, error: jobsErr } = await admin
      .from("jobs")
      .select(
        "id,user_id,job_date,ot,depart,arrivee,fin,km_aller,status,exported_to_sheet"
      )
      .in("id", job_ids);
    if (jobsErr) return json({ ok: false, error: jobsErr.message }, 500);

    const eligible = (jobs || []).filter(
      (j) => j.status === "submitted" && !j.exported_to_sheet
    );
    const skipped = (jobs || []).filter(
      (j) => j.status !== "submitted" || j.exported_to_sheet
    );

    if (eligible.length === 0) {
      return json({
        ok: true,
        exported: 0,
        skipped: skipped.length,
        skipped_ids: skipped.map((j) => j.id),
      });
    }

    // Fetch employee profiles for all unique user_ids in one query
    const userIds = [...new Set(eligible.map((j) => j.user_id))];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", userIds);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    // Fetch auth emails (one call each, but bounded by unique users not jobs)
    const emails = new Map<string, string>();
    await Promise.all(
      userIds.map(async (uid) => {
        const res = await admin.auth.admin.getUserById(uid);
        emails.set(uid, res?.data?.user?.email || "");
      })
    );

    const approvedAt = new Date();
    const approved_at_label = formatMontrealShort(approvedAt);

    const rows = eligible.map((j) => {
      const prof = profileMap.get(j.user_id);
      const depart = j.depart ? String(j.depart).slice(0, 5) : "";
      const arrivee = j.arrivee ? String(j.arrivee).slice(0, 5) : "";
      const fin = j.fin ? String(j.fin).slice(0, 5) : "";
      return {
        job_id: j.id,
        job_date: j.job_date,
        ot: j.ot,
        depart,
        arrivee,
        fin,
        heures: formatHeures(depart, fin),
        km_aller: j.km_aller ?? "",
        employee_name: (prof?.full_name || "").trim(),
        employee_email: emails.get(j.user_id) || "",
        employee_phone: (prof?.phone || "").trim(),
        approved_at: approved_at_label,
        approved_by: approved_by_value,
      };
    });

    // One POST to Apps Script with all rows
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let resp: Response;
    let text = "";
    try {
      resp = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: appsScriptToken, rows }),
        signal: controller.signal,
      });
      text = await resp.text();
    } catch (e) {
      return json(
        { ok: false, error: "AppsScript fetch failed", detail: String(e) },
        502
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      return json(
        { ok: false, error: "AppsScript failed", status: resp.status, detail: text },
        502
      );
    }

    // Mark all eligible jobs as approved + exported in one UPDATE
    const eligibleIds = eligible.map((j) => j.id);
    const { error: updErr } = await admin
      .from("jobs")
      .update({
        status: "approved",
        locked: true,
        exported_to_sheet: true,
        exported_at: approvedAt.toISOString(),
        exported_by: approverId,
      })
      .in("id", eligibleIds);
    if (updErr) return json({ ok: false, error: updErr.message }, 500);

    return json({
      ok: true,
      exported: eligibleIds.length,
      skipped: skipped.length,
      skipped_ids: skipped.map((j) => j.id),
      approved_by: approved_by_value,
      approved_at: approved_at_label,
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
