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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const appsScriptUrl = Deno.env.get("APPS_SCRIPT_URL")!;
    const appsScriptToken = Deno.env.get("APPS_SCRIPT_TOKEN")!;

    if (!supabaseUrl || !serviceRole) {
      return json({ ok: false, error: "Missing Supabase env vars" }, 500);
    }
    if (!appsScriptUrl || !appsScriptToken) {
      return json(
        { ok: false, error: "Missing APPS_SCRIPT_URL or APPS_SCRIPT_TOKEN" },
        500
      );
    }

    const admin = createClient(supabaseUrl, serviceRole);

    // Fetch job
    const { data: job, error: jobErr } = await admin
      .from("jobs")
      .select(
        "id,user_id,job_date,ot,depart,arrivee,fin,km_aller,status,locked,exported_to_sheet,exported_at,updated_by,updated_at"
      )
      .eq("id", job_id)
      .single();

    if (jobErr) return json({ ok: false, error: jobErr.message }, 400);
    if (!job) return json({ ok: false, error: "Job not found" }, 404);

    // ✅ #2 SECURITY: only export SUBMITTED jobs
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

    const electrician_name = prof?.full_name || "";
    const electrician_email = userAuthRes?.data?.user?.email || "";

    // Approver/manager = updated_by (your app sets updated_by on actions)
    const approved_by_id = job.updated_by || null;
    let approved_by_name = "";

    if (approved_by_id) {
      const { data: approverProf } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", approved_by_id)
        .maybeSingle();
      approved_by_name = approverProf?.full_name || "";
    }

    const payload = {
      token: appsScriptToken,
      job_id: job.id,
      status: "approved", // exported row is considered approved record
      job_date: job.job_date,
      ot: job.ot,
      depart: job.depart,
      arrivee: job.arrivee,
      fin: job.fin,
      km_aller: job.km_aller ?? 0,
      electrician_name,
      electrician_email,
      approved_at: job.updated_at,
      approved_by: approved_by_name || approved_by_id || "",
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

    // Mark as exported (do NOT approve here; frontend approves after export)
    const { error: markErr } = await admin
      .from("jobs")
      .update({
        exported_to_sheet: true,
        exported_at: new Date().toISOString(),
        exported_by: approved_by_id,
      })
      .eq("id", job.id);

    if (markErr) return json({ ok: false, error: markErr.message }, 500);

    return json({ ok: true }, 200);
  } catch (e) {
    console.log("[push] unexpected error:", String(e));
    return json({ ok: false, error: String(e) }, 500);
  }
});
