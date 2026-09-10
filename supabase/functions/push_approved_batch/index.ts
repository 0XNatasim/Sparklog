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
    if (!approverProfile || !["manager", "admin"].includes(approverProfile.role)) {
      return json({ ok: false, error: "Forbidden: manager role required" }, 403);
    }
    const approved_by_value =
      (approverProfile.full_name || "").trim() || approverEmail || approverId;

    // Read the requested jobs.
    const { data: jobs, error: jobsErr } = await admin
      .from("jobs")
      .select(
        "id,user_id,job_date,ot,depart,arrivee,fin,km_aller,return_time_minutes,km_retour,status,exported_to_sheet"
      )
      .in("id", job_ids);
    if (jobsErr) return json({ ok: false, error: jobsErr.message }, 500);

    const eligible = (jobs || []).filter(
      (j) => j.status === "submitted" && !j.exported_to_sheet
    );
    const alreadySkipped = (jobs || []).filter(
      (j) => j.status !== "submitted" || j.exported_to_sheet
    );

    if (eligible.length === 0) {
      return json({
        ok: true,
        exported: 0,
        skipped: alreadySkipped.length,
        skipped_ids: alreadySkipped.map((j) => j.id),
      });
    }

    const approvedAt = new Date();
    const approved_at_label = formatMontrealShort(approvedAt);

    // ✅ Idempotent claim. Atomically mark the still-eligible jobs approved+exported
    // BEFORE calling Apps Script, and only export the rows this call actually claimed.
    // A concurrent or double-clicked call matches 0 rows here (they are no longer
    // status='submitted' AND exported_to_sheet=false), so it writes nothing to the
    // sheet — no duplicate rows. If the Apps Script write then fails, the claim is
    // reverted so the jobs can be retried.
    const eligibleIds = eligible.map((j) => j.id);
    const { data: claimedRows, error: claimErr } = await admin
      .from("jobs")
      .update({
        status: "approved",
        locked: true,
        exported_to_sheet: true,
        exported_at: approvedAt.toISOString(),
        exported_by: approverId,
      })
      .in("id", eligibleIds)
      .eq("status", "submitted")
      .eq("exported_to_sheet", false)
      .select("id");
    if (claimErr) return json({ ok: false, error: claimErr.message }, 500);

    const claimedIds = (claimedRows || []).map((r) => r.id);
    if (claimedIds.length === 0) {
      // Another concurrent call already claimed these — do not export again.
      return json({ ok: true, exported: 0, skipped: (jobs || []).length, note: "already_claimed" });
    }
    const claimedSet = new Set(claimedIds);
    const claimedJobs = eligible.filter((j) => claimedSet.has(j.id));

    const revertClaim = async () => {
      await admin
        .from("jobs")
        .update({ status: "submitted", exported_to_sheet: false, exported_at: null, exported_by: null })
        .in("id", claimedIds);
    };

    // Profiles + auth emails for the claimed jobs only.
    const userIds = [...new Set(claimedJobs.map((j) => j.user_id))];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, phone, role")
      .in("id", userIds);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    const emails = new Map<string, string>();
    await Promise.all(
      userIds.map(async (uid) => {
        const res = await admin.auth.admin.getUserById(uid);
        emails.set(uid, res?.data?.user?.email || "");
      })
    );

    const rows = claimedJobs.map((j) => {
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
        return_time_minutes: j.return_time_minutes ?? 0,
        km_retour: j.km_retour ?? 0,
        employee_name: (prof?.full_name || "").trim(),
        employee_email: emails.get(j.user_id) || "",
        employee_phone: (prof?.phone || "").trim(),
        // Pay basis for the Apps Script sheet: 'admin' (administration/office) staff are
        // paid a flat hourly rate, NOT on the CCQ wage grid, so the sheet must apply flat
        // pay (no CCQ premiums/overtime rules) for these rows. Everyone else is 'ccq'.
        employee_pay_basis: prof?.role === "admin" ? "flat_hourly" : "ccq",
        approved_at: approved_at_label,
        approved_by: approved_by_value,
      };
    });

    // One POST to Apps Script with the claimed rows.
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
      await revertClaim();
      return json(
        { ok: false, error: "AppsScript fetch failed", detail: String(e) },
        502
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      await revertClaim();
      return json(
        { ok: false, error: "AppsScript failed", status: resp.status, detail: text },
        502
      );
    }

    // Apps Script must explicitly confirm the write with { success: true }.
    // A non-JSON body (e.g. a Google login/permission HTML page returned with
    // HTTP 200 when the deployment's access isn't "Anyone") or an explicit
    // failure means nothing was written — revert the claim so nothing is stuck.
    let sheetResult: { success?: boolean; written?: number; skipped?: number } = {};
    try { sheetResult = JSON.parse(text); } catch { /* not JSON — treated as failure below */ }
    if (sheetResult?.success !== true) {
      await revertClaim();
      return json({
        ok: false,
        error: "AppsScript did not confirm the write. Check that the web-app deployment's access is set to \"Anyone\" and that it runs the latest code.",
        detail: String(text).slice(0, 500),
      }, 502);
    }

    return json({
      ok: true,
      exported: claimedIds.length,
      skipped: (jobs || []).length - claimedIds.length,
      skipped_ids: alreadySkipped.map((j) => j.id),
      sheet_written: sheetResult?.written,
      sheet_skipped: sheetResult?.skipped,
      approved_by: approved_by_value,
      approved_at: approved_at_label,
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
