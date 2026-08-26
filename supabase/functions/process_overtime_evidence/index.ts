import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function validatesOvertimeSms(text: string) {
  const normalized = text.toLocaleLowerCase("fr-CA");
  const mentionsOvertime = /temps\s+suppl[eé]mentaire|\bts\b/.test(normalized);
  const confirmsApproval = /approuv[eé]e?|autoris[eé]e?|accord[eé]e?/.test(normalized);
  const includesDuration = /\b\d+(?:[.,]\d+)?\s*(?:h(?:eure)?s?|min(?:ute)?s?)\b/.test(normalized);
  return mentionsOvertime && confirmsApproval && includesDuration;
}

async function processEvidence(admin: ReturnType<typeof createClient>, evidence: { id: string; storage_path: string }) {
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
    const status = text && validatesOvertimeSms(text) ? "processed" : "needs_review";
    const { error: updateError } = await admin
      .from("overtime_evidence")
      .update({ ocr_text: text || null, ocr_status: status })
      .eq("id", evidence.id);
    if (updateError) throw updateError;
  } catch (error) {
    console.error("[process_overtime_evidence]", error);
    await admin
      .from("overtime_evidence")
      .update({ ocr_status: "failed" })
      .eq("id", evidence.id);
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

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json({ ok: false, error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const evidenceId = body?.evidence_id;
  if (!evidenceId) return json({ ok: false, error: "Missing evidence_id" }, 400);

  const admin = createClient(supabaseUrl, serviceRole);
  const { data: evidence, error } = await admin
    .from("overtime_evidence")
    .select("id, user_id, storage_path, ocr_status")
    .eq("id", evidenceId)
    .single();
  if (error || !evidence) return json({ ok: false, error: "Evidence not found" }, 404);
  if (evidence.user_id !== userData.user.id) return json({ ok: false, error: "Forbidden" }, 403);
  if (evidence.ocr_status !== "pending") return json({ ok: true, skipped: true });

  EdgeRuntime.waitUntil(processEvidence(admin, evidence));
  return json({ ok: true, accepted: true }, 202);
});
