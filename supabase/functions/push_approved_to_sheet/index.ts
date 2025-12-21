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

// "20 Dec 14:09" en heure Montréal
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
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const body = await req.json().catch(() => ({}));
    const job_id = body?.job_id;

    if (!job_id) return json({ ok: false, error: "Missing job_id" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const appsScriptUrl = Deno.env.get("APPS_SCRIPT_URL") ?? "";
    const appsScriptToken = Deno.env.get("APPS_SCRIPT_TOKEN") ?? "";

    if (!supabaseUrl || !serviceRole) {
      return json({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }
    if (!anonKey) {
      return json({ ok: false, error: "Missing SUPABASE_ANON_KEY (needed to identify approver)" }, 500);
    }
    if (!appsScriptUrl || !appsScriptToken) {
      return json(
        { ok: false, error: "Missing APPS_SCRIPT_URL or APPS_SCRIPT_TOKEN" },
        500
      );
    }

    // ✅ Identify WHO is calling (manager token)
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      return json({ ok: false, error: "Missing Authorization bearer token" }, 401);
    }

    // client "as caller" (manager session)
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: callerUserRes, error: callerUserErr } = await caller.auth.getUser();
    if (callerUserErr || !callerUserRes?.user) {
      return json({ ok: false, error: "Invalid session token" }, 401);
    }

    const approverId = callerUserRes.user.id;
    const approverEmail = callerUserRes.user.email || "";

    // admin client for DB reads/writes
    const admin = createClient(supabaseUrl, serviceRole);

    // ✅ Enforce manager role (only manager can export)
    const { data: approverProfile, error: approverProfErr } = await admin
      .from("profiles")
      .select("role, full_name")
      .eq("id", approverId)
      .maybeSingle();

    if (approverProfErr) {
      return json({ ok: false, error: approverProfErr.message }, 500);
    }
    if (!approverProfile || approverProfile.role !== "manager") {
      return json({ ok: false, error: "Forbidden: manager role required" }, 403);
    }

    const approverName = (approverProfile.full_name || "").trim();
    const approved_by_value = approverName || approverEmail || approverId;

    // Fetch job
    const { data: job, error: jobErr } = await admin
      .from("jobs")
      .select(
        "id,user_id,job_date,ot,depart,arrivee,fin,km_aller,status,locked,exported_to_sheet,exported_at"
      )
      .eq("id", job_id)
      .single();

    if (jobErr) return json({ ok: false, error: jobErr.message }, 400);
    if (!job) return json({ ok: false, error: "Job not found" }, 404);

    // ✅ Security: only export SUBMITTED jobs
    if (job.status !== "submitted") {
      return json(
        { ok: false, error: "Job must be submitted to export", status: job.status },
        400
      );
    }

    // Idempotent: do not export twice
    if (job.exported_to_sheet) {
      return json({ ok: true, skipped: true, reason: "already_exported" }, 200);
    }

    // Get electrician profile + email
    const [{ data: prof }, userAuthRes] = await Promise.all([
      admin
        .from("profiles")
        .select("full_name")
        .eq("id", job.user_id)
        .maybeSingle(),
      admin.auth.admin.getUserById(job.user_id),
    ]);

    const electrician_name = (prof?.full_name || "").trim();
    const electrician_email = userAuthRes?.data?.user?.email || "";

    const approvedAtDate = new Date();
    const approved_at_label = formatMontrealShort(approvedAtDate);

    const payload = {
      token: appsScriptToken,
      job_id: job.id,
      status: "approved", // row in sheet represents an approved record
      job_date: job.job_date,
      ot: job.ot,
      depart: job.depart ? String(job.depart).slice(0, 5) : "",   // HH:mm
      arrivee: job.arrivee ? String(job.arrivee).slice(0, 5) : "", // HH:mm
      fin: job.fin ? String(job.fin).slice(0, 5) : "",           // HH:mm
      km_aller: job.km_aller ?? "",
      electrician_name,
      electrician_email,
      approved_at: approved_at_label,      // ✅ "20 Dec 14:09" Montreal time
      approved_by: approved_by_value,      // ✅ ALWAYS the manager (from token)
    };

    console.log("[push] job_id:", job.id);
    console.log("[push] appsScriptUrl:", appsScriptUrl);

    // Call Apps Script with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let resp: Response;
    let text = "";

    try {
      resp = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      text = await resp.text();
      console.log("[push] AppsScript status:", resp.status);
      console.log("[push] AppsScript response:", text);
    } catch (e) {
      console.log("[push] AppsScript fetch error:", String(e));
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

    // Mark as exported (frontend still changes status to approved after export)
    const { error: markErr } = await admin
      .from("jobs")
      .update({
        exported_to_sheet: true,
        exported_at: approvedAtDate.toISOString(),
        exported_by: approverId, // ✅ manager id
      })
      .eq("id", job.id);

    if (markErr) return json({ ok: false, error: markErr.message }, 500);

    return json(
      { ok: true, approved_by: approved_by_value, approved_at: approved_at_label },
      200
    );
  } catch (e) {
    console.log("[push] unexpected error:", String(e));
    return json({ ok: false, error: String(e) }, 500);
  }
});
