import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseInventoryText } from "./parse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Target = { userId: string; jobDate: string; slot: number };

// Reads one inventory screenshot with OCR, stores the equipment rows it contains and
// classifies the result. Only the parsed rows (code, name, quantity) are kept, never the
// raw OCR text. Safe to run again: the slot's rows are replaced.
async function processScreenshot(admin: ReturnType<typeof createClient>, target: Target) {
  const { userId, jobDate, slot } = target;
  const setStatus = (ocr_status: string, list_total: number | null = null) =>
    admin.from("inventory_screenshots").update({ ocr_status, list_total })
      .eq("user_id", userId).eq("job_date", jobDate).eq("slot", slot);
  try {
    const { data: shot, error: shotError } = await admin
      .from("inventory_screenshots").select("storage_path, expires_at")
      .eq("user_id", userId).eq("job_date", jobDate).eq("slot", slot).single();
    if (shotError || !shot) throw shotError || new Error("Screenshot row not found");

    const { data: file, error: downloadError } = await admin.storage.from("inventory-screenshots").download(shot.storage_path);
    if (downloadError || !file) throw downloadError || new Error("Screenshot download failed");

    const form = new FormData();
    form.append("file", file, "inventory.jpg");
    form.append("language", "fre");
    form.append("OCREngine", "2");
    form.append("scale", "true");
    form.append("isTable", "true");
    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: Deno.env.get("OCR_SPACE_API_KEY") || "helloworld" },
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`ocr.space HTTP ${response.status}`);
    const result = await response.json();
    if (result?.IsErroredOnProcessing) {
      const message = Array.isArray(result.ErrorMessage) ? result.ErrorMessage.join("; ") : result.ErrorMessage;
      throw new Error(String(message || "ocr.space processing failed"));
    }
    const text = (result?.ParsedResults || []).map((item: { ParsedText?: string }) => item?.ParsedText || "").join("\n");
    const parsed = parseInventoryText(text);

    // Replace this slot's rows (a retake or a re-run must not leave stale equipment behind).
    const { error: clearError } = await admin.from("inventory_items").delete()
      .eq("user_id", userId).eq("job_date", jobDate).eq("slot", slot);
    if (clearError) throw clearError;
    if (parsed.items.length) {
      const unique = new Map(parsed.items.map((item) => [item.code, item]));
      const { error: insertError } = await admin.from("inventory_items").insert(
        [...unique.values()].map((item) => ({
          user_id: userId, job_date: jobDate, slot, code: item.code, name: item.name,
          quantity: item.quantity, expires_at: shot.expires_at,
        })),
      );
      if (insertError) throw insertError;
    }
    const { error: updateError } = await setStatus(parsed.items.length > 0 && parsed.unparsed === 0 ? "processed" : "needs_review", parsed.total);
    if (updateError) throw updateError;
  } catch (error) {
    console.error("[process_inventory_screenshot]", error);
    await setStatus("failed");
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
  const jobDate = String(body?.job_date || "");
  const slot = Number(body?.slot);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jobDate) || !Number.isInteger(slot) || slot < 1 || slot > 3) {
    return json({ ok: false, error: "job_date and slot (1-3) are required" }, 400);
  }

  // Employees process their own screenshots; managers may re-run any employee's reading.
  let userId = userData.user.id;
  const requested = typeof body?.user_id === "string" ? body.user_id : "";
  if (requested && requested !== userId) {
    const { data: role } = await caller.rpc("get_my_role");
    if (role !== "manager") return json({ ok: false, error: "Forbidden" }, 403);
    userId = requested;
  }

  const admin = createClient(supabaseUrl, serviceRole);
  const { data: shot } = await admin.from("inventory_screenshots").select("slot")
    .eq("user_id", userId).eq("job_date", jobDate).eq("slot", slot).maybeSingle();
  if (!shot) return json({ ok: false, error: "Screenshot not found" }, 404);
  await admin.from("inventory_screenshots").update({ ocr_status: "pending", list_total: null })
    .eq("user_id", userId).eq("job_date", jobDate).eq("slot", slot);

  EdgeRuntime.waitUntil(processScreenshot(admin, { userId, jobDate, slot }));
  return json({ ok: true, accepted: true }, 202);
});
