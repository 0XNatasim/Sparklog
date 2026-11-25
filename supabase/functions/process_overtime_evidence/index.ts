import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import jpeg from "https://esm.sh/jpeg-js@0.4.4";
import { formKindOf, overtimeFormFound, readOvertimeForm } from "../_shared/overtime_form.js";
import { findSelectedCircles } from "../_shared/radio_circles.js";

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

// The old way: the screenshot of the approval text message (« Demande de temps supplémentaire approuvé. Quand votre surtemps est
// complété remplissez se formulaire svp… »). It names the overtime and says it is approved; it carries no minutes.
function isOvertimeSmsText(text: string) {
  const normalized = text.toLocaleLowerCase("fr-CA");
  const mentionsOvertime = /temps\s+suppl[eé]mentaire|surtemps|\bts\b/.test(normalized);
  const confirmsApproval = /approuv[eé]e?|autoris[eé]e?|accord[eé]e?/.test(normalized);
  return mentionsOvertime && confirmsApproval;
}

// One reading, one attempt: the queue (migration 0147) decides when a proof is tried again. `attempts` = attempts already made.
const MAX_ATTEMPTS = 5;

async function processEvidence(admin: ReturnType<typeof createClient>, evidence: { id: string; storage_path: string; attempts: number }) {
  try {
    const { data: file, error: downloadError } = await admin.storage
      .from("overtime-evidence")
      .download(evidence.storage_path);
    if (downloadError || !file) throw downloadError || new Error("Screenshot download failed");

    const apiKey = Deno.env.get("OCR_SPACE_API_KEY") || "helloworld";
    const form = new FormData();
    form.append("file", file, "overtime.jpg");
    form.append("language", "fre");
    form.append("OCREngine", "2");
    form.append("scale", "true");
    form.append("isTable", "true");
    // The position of every line: the answers are read under their questions (see readOvertimeForm).
    form.append("isOverlayRequired", "true");

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: apiKey },
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`ocr.space HTTP ${response.status}`);

    const result = await response.json();
    if (result?.IsErroredOnProcessing) {
      const message = Array.isArray(result.ErrorMessage) ? result.ErrorMessage.join("; ") : result.ErrorMessage;
      throw new Error(String(message || "ocr.space processing failed"));
    }

    const text = (result?.ParsedResults || []).map((item: { ParsedText?: string }) => item?.ParsedText || "").join("\n").trim();
    // The proof is now the overtime request form: keep its three numbers (OT, minutes at the client, return minutes).
    // An older app version may still send the SMS screenshot, which is classified as before.
    const lines = (result?.ParsedResults || []).flatMap((item: { TextOverlay?: { Lines?: Array<{ LineText?: string; MinTop?: number; MaxHeight?: number; Words?: Array<{ Left?: number; Top?: number; Height?: number }> }> } }) =>
      (item?.TextOverlay?.Lines || []).map((line) => ({
        text: line?.LineText || "",
        top: Number(line?.Words?.[0]?.Top ?? line?.MinTop),
        left: Number(line?.Words?.[0]?.Left) || 0,
        height: Number(line?.MaxHeight ?? line?.Words?.[0]?.Height) || 0,
      })));
    // The form of November 2026 is made of multiple choice questions: the text does not say which circle is filled, so the picture
    // is decoded and its selected (teal) circles are found. Any failure here only leaves the two answers empty (needs_review).
    let circles: Array<{ x: number; y: number }> = [];
    try {
      const decoded = jpeg.decode(new Uint8Array(await file.arrayBuffer()), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
      circles = findSelectedCircles({ width: decoded.width, height: decoded.height, data: decoded.data });
    } catch (decodeError) {
      console.error("[process_overtime_evidence] decode", decodeError);
    }
    let parsed = readOvertimeForm({ text, lines, circles });
    // A circle was found that no answer used (more circles than answers): log what the matching saw (positions and the numeric choice lines only, no personal text)
    // so the cause can be read in the function logs.
    const answered = (parsed.clientMinutes === null ? 0 : 1) + (parsed.returnMinutes === null ? 0 : 1);
    if (circles.length > answered) {
      console.log("[process_overtime_evidence] circle without answer", JSON.stringify({
        circles: circles.map((circle) => [Math.round(circle.x), Math.round(circle.y)]),
        choiceLines: lines.filter((line) => /^[\s\W]*(?:[Oo0()]\s+)?\d{1,3}\W*$|^\W*\+\s*de/i.test(line.text) || /^[Oo]$/.test(line.text.trim()))
          .map((line) => [line.text.slice(0, 20), Math.round(line.top), Math.round(line.height)]),
        headings: lines.filter((line) => /dur[eé]e|commentaire/i.test(line.text)).map((line) => [line.text.slice(0, 40), Math.round(line.top)]),
      }));
    }
    // What the picture is: the overtime form (its own questions are there), an old SMS screenshot, something else (a work order,
    // a receipt…: « wrong_document », the numbers read on it mean nothing and are dropped), or nothing readable.
    // form_kind (migration 0161): "new" / "old" (the two versions of the form), "field" (a Field Service work order), "sms", "other".
    const kind = formKindOf(text);
    let status: string;
    let formKind: string | null = null;
    if (!text) status = "needs_review";
    else if (kind === "new" || kind === "old") {
      status = overtimeFormFound(parsed) ? "processed" : "needs_review";
      formKind = kind;
    } else if (isOvertimeSmsText(text)) {
      status = "sms"; // the old text-message proof: not a valid proof, no minutes to compare
      formKind = "sms";
    } else {
      status = "wrong_document";
      formKind = kind === "field" ? "field" : "other";
      parsed = { ot: null, clientMinutes: null, returnMinutes: null };
    }
    const { error: updateError } = await admin
      .from("overtime_evidence")
      // Persist only the classification and the three numbers. Raw text can contain names, phone
      // numbers and unrelated metadata and is not needed by the UI.
      .update({
        ocr_text: null,
        ocr_status: status,
        form_kind: formKind,
        proof_ot: parsed.ot,
        proof_client_minutes: parsed.clientMinutes,
        proof_return_minutes: parsed.returnMinutes,
        proof_read_at: new Date().toISOString(),
      })
      .eq("id", evidence.id);
    if (updateError) throw updateError;
    // A wrong picture on a submitted job: give the job back to the employee, if the manager switched that control on
    // (overtime_settings.auto_return_wrong_proof, migration 0149). Best effort: the reading itself is already saved.
    if (status === "wrong_document") {
      const { error: returnError } = await admin.rpc("auto_return_wrong_proof", { p_proof_id: evidence.id });
      if (returnError) console.error("[process_overtime_evidence] auto return", returnError);
    }
  } catch (error) {
    console.error("[process_overtime_evidence]", error);
    const attempts = (evidence.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      // Out of attempts: « failed » (a manager can put it back in the queue with « Relire »).
      await admin
        .from("overtime_evidence")
        .update({ ocr_status: "failed", ocr_attempts: attempts, proof_read_at: new Date().toISOString() })
        .eq("id", evidence.id);
    } else {
      // Back to the bottom of the queue (its last try is now), not tried again for 10 minutes × attempts.
      await admin
        .from("overtime_evidence")
        .update({
          ocr_status: "pending",
          ocr_attempts: attempts,
          ocr_last_try_at: new Date().toISOString(),
          ocr_next_try_at: new Date(Date.now() + attempts * 10 * 60 * 1000).toISOString(),
        })
        .eq("id", evidence.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = req.headers.get("authorization") || "";
  if (!supabaseUrl || !anonKey || !serviceRole) return json({ ok: false, error: "Server env not configured" }, 500);

  const admin = createClient(supabaseUrl, serviceRole);

  // The scheduled job (pg_cron, migration 0147): one proof a minute, taken from the queue.
  const cronSecret = req.headers.get("x-cron-secret") || "";
  if (cronSecret) {
    const { data: allowed } = await admin.rpc("verify_cron_secret", { p_secret: cronSecret });
    if (allowed !== true) return json({ ok: false, error: "Unauthorized" }, 401);
    const { data: claimed, error: claimError } = await admin.rpc("claim_next_overtime_proof");
    if (claimError) return json({ ok: false, error: claimError.message }, 500);
    const next = Array.isArray(claimed) ? claimed[0] : null;
    if (!next) return json({ ok: true, idle: true });
    EdgeRuntime.waitUntil(processEvidence(admin, { id: next.proof_id, storage_path: next.proof_path, attempts: next.attempts_done }));
    return json({ ok: true, accepted: true }, 202);
  }

  // The employee's phone after an upload: the proof is already `pending` in the queue, the scheduled job will read it.
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const evidenceId = body?.evidence_id;
  if (!evidenceId) return json({ ok: false, error: "Missing evidence_id" }, 400);

  const { data: evidence, error } = await admin
    .from("overtime_evidence")
    .select("id, user_id, ocr_status")
    .eq("id", evidenceId)
    .single();
  if (error || !evidence) return json({ ok: false, error: "Evidence not found" }, 404);
  if (evidence.user_id !== userData.user.id) return json({ ok: false, error: "Forbidden" }, 403);
  return json({ ok: true, queued: evidence.ocr_status === "pending" }, 202);
});
